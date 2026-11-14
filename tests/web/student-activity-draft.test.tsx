import { render,screen,act,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it,expect,vi,afterEach } from 'vitest';
import { StudentTargetEditor } from '../../apps/web/src/modules/student/StudentTargetEditor.js';
import { StudentSubmissionControls } from '../../apps/web/src/modules/student/StudentSubmissionControls.js';
import { ids } from '../helpers/foundation.js';
import { StudentDraftPanel } from '../../apps/web/src/modules/student/StudentDraftPanel.js';
import { StudentSessionPlaceholder } from '../../apps/web/src/pages/StudentSessionPlaceholder.js';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const realtime=vi.hoisted(()=>({sockets:[] as any[],snapshot:null as any}));
vi.mock('socket.io-client',()=>({io:()=>{
 const handlers=new Map<string,Set<Function>>();const socket={connected:false,on:(name:string,fn:Function)=>{if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name)!.add(fn);return socket;},off:(name:string,fn:Function)=>{handlers.get(name)?.delete(fn);return socket;},removeAllListeners:()=>handlers.clear(),receive:(name:string,value?:unknown)=>{for(const fn of [...handlers.get(name)??[]])fn(value);},emit:(name:string)=>{if(name==='student:draft:watch')socket.receive('student:draft:snapshot',realtime.snapshot);if(name==='session:watch')socket.receive('session:state',{sessionId:realtime.snapshot.sessionId,currentRoundId:realtime.snapshot.roundId,phase:'Active',stateVersion:1,changedAt:'2026-11-14T00:00:00.000Z',target:{kind:'question',questionId:'00000000-0000-4000-8000-000000000020'}});},connect:()=>{socket.connected=true;socket.receive('connect');},disconnect:()=>{socket.connected=false;socket.receive('disconnect');}};realtime.sockets.push(socket);return socket;
}}));
afterEach(()=>{vi.unstubAllGlobals();realtime.sockets=[];});
const q={id:ids.question1,sessionId:ids.session1,questionGroupId:null,displayNumber:'1',prompt:'Question',position:0,blanks:[{id:ids.blank1,questionId:ids.question1,label:'空格一',position:0}]};
it.each([390,1280])('keeps focus and unsaved text during remote updates at viewport %i',async(width)=>{
 window.innerWidth=width;let finish:()=>void=()=>{};const edit=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const props={questions:[q],values:{[ids.blank1]:'saved'},disabled:false,onEdit:edit,onDirty:vi.fn()};
 const view=render(<StudentTargetEditor {...props}/>);const input=screen.getByLabelText('空格一');await userEvent.click(input);await userEvent.type(input,'x');
 view.rerender(<StudentTargetEditor {...props} values={{[ids.blank1]:'remote'}}/>);expect(input).toHaveFocus();expect(input).toHaveValue('savedx');
 await act(async()=>finish());expect(input).toHaveValue('savedx');
});
it('renders multiple questions and makes locked inputs read-only',()=>{
 render(<StudentTargetEditor questions={[{...q,blanks:[...q.blanks,{...q.blanks[0],id:ids.blank2,label:'空格二',position:1}]},{...q,id:ids.question2,prompt:'Second',blanks:[{...q.blanks[0],id:ids.blankOther,questionId:ids.question2,label:'空格三'},{...q.blanks[0],id:ids.result2,questionId:ids.question2,label:'空格四',position:1}]}]} values={{}} disabled onEdit={vi.fn()} onDirty={vi.fn()}/>);
 expect(screen.getAllByRole('textbox')).toHaveLength(4);expect(screen.getByLabelText('空格二')).toBeDisabled();
});
it('retains failed edits instead of replacing them with an incoming saved value',async()=>{
 const props={questions:[q],values:{[ids.blank1]:'saved'},disabled:false,onEdit:vi.fn(async()=>{throw Error('儲存失敗');}),onDirty:vi.fn()};const view=render(<StudentTargetEditor {...props}/>);
 const input=screen.getByLabelText('空格一');await userEvent.click(input);await userEvent.type(input,'x');await screen.findByRole('alert');view.rerender(<StudentTargetEditor {...props} values={{[ids.blank1]:'remote'}}/>);await userEvent.tab();
 expect(input).toHaveValue('savedx');expect(screen.getByRole('button',{name:'重試儲存'})).toBeTruthy();
});
it('permits only a ready leader to submit and reports incomplete/saving states',()=>{
 const props={isLeader:false,locked:false,busy:false,complete:false,ready:true,onSubmit:vi.fn()};const view=render(<StudentSubmissionControls {...props}/>);
 expect(screen.queryByRole('button',{name:'提交本組答案'})).toBeNull();view.rerender(<StudentSubmissionControls {...props} isLeader/>);expect(screen.getByRole('button',{name:'提交本組答案'})).toBeDisabled();
 view.rerender(<StudentSubmissionControls {...props} isLeader complete busy/>);expect(screen.getByRole('button')).toBeDisabled();
});
const membership={sessionId:ids.session1,participantId:ids.participant1,team:{teamId:ids.team1,name:'Team A'},isLeader:true};
function draftProps(){realtime.snapshot={sessionId:ids.session1,roundId:ids.round1,version:1,status:'editable',answers:[{blankId:ids.blank1,value:'saved',revision:1}]};return {sessionId:ids.session1,roundId:ids.round1,target:{roundId:ids.round1,target:{kind:'question' as const,question:q}},membership,csrfToken:'csrf',activityConnected:true,onIdentityRefresh:vi.fn()};}

it('refreshes membership on notices and reconnect, ignoring obsolete reads without discarding the draft', async () => {
 const props = draftProps();
 const response = (data:unknown) => ({ok:true,json:async()=>({data})});
 let deferReads = false;
 const reads: Array<(value: ReturnType<typeof response>) => void> = [];
 const member = {...membership,displayName:'Alice'};
 const fetcher = vi.fn(async (url: unknown) => {
   const path = String(url);
   if (path.endsWith('/me')) return deferReads ? new Promise<ReturnType<typeof response>>(resolve=>reads.push(resolve)) : response(member);
   if (path.endsWith('/csrf-token')) return response({csrfToken:'csrf'});
   if (path.endsWith('/current-target')) return response(props.target);
   return response(realtime.snapshot);
 });
 vi.stubGlobal('fetch',fetcher);
 render(<MemoryRouter initialEntries={[`/student/session/${ids.session1}`]}><Routes><Route path="/student/session/:sessionId" element={<StudentSessionPlaceholder/>}/></Routes></MemoryRouter>);
 const submit = () => screen.queryByRole('button',{name:'提交本組答案'});
 await waitFor(()=>expect(submit()).toBeEnabled());
 const input = screen.getByLabelText('空格一');
 const stateSocket = realtime.sockets[0];
 deferReads = true;
 act(()=>stateSocket.receive('student:membership:changed',{sessionId:ids.session2,teamId:ids.team1}));
 expect(reads).toHaveLength(0);
 const notice = () => stateSocket.receive('student:membership:changed',{sessionId:ids.session1,teamId:ids.team1});
 act(notice);
 expect(submit()).toBeDisabled();
 act(notice);
 await act(async()=>reads[1](response({...member,isLeader:false})));
 await act(async()=>reads[0](response(member)));
 expect(submit()).toBeNull();
 expect(input).toHaveValue('saved');
 act(()=>stateSocket.disconnect());
 act(()=>stateSocket.connect());
 await act(async()=>reads[2](response(member)));
 await waitFor(()=>expect(submit()).toBeEnabled());
 expect(screen.getByLabelText('空格一')).toBe(input);
});
it('uses the adapter for remote updates, disconnect recovery and scope isolation',async()=>{
 const props=draftProps();vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({data:realtime.snapshot})})));render(<StudentDraftPanel {...props} membership={{...membership,isLeader:false}}/>);
 const input=await screen.findByLabelText('空格一');await waitFor(()=>expect(input).not.toBeDisabled());expect(input).toHaveValue('saved');expect(screen.queryByRole('button',{name:'提交本組答案'})).toBeNull();
 act(()=>realtime.sockets[0].receive('student:draft:changed',{sessionId:ids.session2,roundId:ids.round1,version:9,answer:{blankId:ids.blank1,value:'foreign',revision:9},clientMutationId:ids.submission1}));expect(input).toHaveValue('saved');
 act(()=>realtime.sockets[0].receive('student:draft:changed',{sessionId:ids.session1,roundId:ids.round1,version:2,answer:{blankId:ids.blank1,value:'shared',revision:2},clientMutationId:ids.submission1}));expect(input).toHaveValue('shared');
 act(()=>realtime.sockets[0].disconnect());expect(input).toBeDisabled();realtime.snapshot={...realtime.snapshot,version:3,answers:[{blankId:ids.blank1,value:'restored',revision:3}]};act(()=>realtime.sockets[0].connect());await waitFor(()=>expect(input).toHaveValue('restored'));expect(input).not.toBeDisabled();
});
it('reports STALE_STATE, prevents duplicate submits, locks on success and resets for the next Round',async()=>{
 const props=draftProps();let posts=0;const fetcher=vi.fn(async(_url:unknown,options?:RequestInit)=>{
  if(options?.method==='POST'){posts++;if(posts===1)return {ok:false,status:409,json:async()=>({error:{code:'STALE_STATE',message:'草稿已變更'}})};return {ok:true,json:async()=>({data:{draftStatus:'locked',submissionId:ids.submission1,acceptedOrder:1}})};}
  return {ok:true,json:async()=>({data:realtime.snapshot})};
 });vi.stubGlobal('fetch',fetcher);const view=render(<StudentDraftPanel {...props}/>);const button=await screen.findByRole('button',{name:'提交本組答案'});await waitFor(()=>expect(button).not.toBeDisabled());await userEvent.click(button);expect(await screen.findByRole('alert')).toHaveTextContent('草稿已變更');
 await waitFor(()=>expect(button).not.toBeDisabled());await userEvent.dblClick(button);expect(await screen.findByText('本組已提交，草稿為唯讀。')).toBeTruthy();expect(posts).toBe(2);expect(screen.getByLabelText('空格一')).toBeDisabled();
 realtime.snapshot={...realtime.snapshot,roundId:ids.round2,version:0,answers:[]};view.rerender(<StudentDraftPanel key={ids.round2} {...props} roundId={ids.round2} target={{...props.target,roundId:ids.round2}}/>);await waitFor(()=>expect(screen.getByLabelText('空格一')).not.toBeDisabled());expect(screen.getByLabelText('空格一')).toHaveValue('');
});
it.each(['DUPLICATE_SUBMISSION','FORBIDDEN','UNAUTHENTICATED','INVALID_PHASE'])('handles the server submission error %s',async(code)=>{
 const props=draftProps();vi.stubGlobal('fetch',vi.fn(async(_url:unknown,options?:RequestInit)=>options?.method==='POST'?{ok:false,status:code==='FORBIDDEN'?403:code==='UNAUTHENTICATED'?401:409,json:async()=>({error:{code,message:`提交失敗：${code}`}})}:{ok:true,json:async()=>({data:realtime.snapshot})}));
 render(<StudentDraftPanel {...props}/>);const button=await screen.findByRole('button',{name:'提交本組答案'});await waitFor(()=>expect(button).not.toBeDisabled());await userEvent.click(button);
 expect(await screen.findByRole('alert')).toHaveTextContent(code);
 if(code==='DUPLICATE_SUBMISSION')expect(screen.getByText('本組已提交，草稿為唯讀。')).toBeTruthy();
 if(code==='FORBIDDEN'||code==='UNAUTHENTICATED')expect(props.onIdentityRefresh).toHaveBeenCalled();
 if(code==='INVALID_PHASE')expect(screen.getByLabelText('空格一')).toBeDisabled();
});
