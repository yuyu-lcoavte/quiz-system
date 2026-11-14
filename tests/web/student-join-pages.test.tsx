import { render,screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter,Routes,Route } from 'react-router-dom';
import { it,expect,vi,afterEach } from 'vitest';
import { StudentJoinPlaceholder } from '../../apps/web/src/pages/StudentJoinPlaceholder.js';
import { ids } from '../helpers/foundation.js';
const member={sessionId:ids.session1,participantId:ids.participant1,team:{teamId:ids.team1,name:'Team A'},isLeader:true};
afterEach(()=>vi.unstubAllGlobals());
function show(){render(<MemoryRouter><Routes><Route path="/" element={<StudentJoinPlaceholder/>}/><Route path="/student/session/:sessionId" element={<p>活動已開啟</p>}/></Routes></MemoryRouter>);}
it('looks up existing Teams and enrolls with Cookie credentials without client role authority',async()=>{
 const fetcher=vi.fn(async(url:unknown,options?:RequestInit)=>{
  const path=String(url);let data:unknown;
  if(path.includes('/me')||path.includes('csrf-token'))return {ok:false,status:401,json:async()=>({error:{code:'UNAUTHENTICATED',message:'尚未加入'}})};
  if(path.includes('by-code'))data={sessionId:ids.session1,phase:'Active'};
  else if(path.includes('join-options'))data={sessionId:ids.session1,phase:'Active',teams:[{teamId:ids.team1,name:'Team A'}]};
  else{expect(JSON.parse(String(options?.body))).toEqual({teamId:ids.team1,displayName:'Alice'});expect(options?.credentials).toBe('same-origin');data={...member,csrfToken:'csrf'};}
  return {ok:true,json:async()=>({data})};
 });vi.stubGlobal('fetch',fetcher);show();const user=userEvent.setup();
 await user.type(screen.getByLabelText('活動代號'),'CODE');await user.click(screen.getByRole('button',{name:'查詢活動'}));
 await screen.findByLabelText('顯示名稱');await user.type(screen.getByLabelText('顯示名稱'),'Alice');await user.selectOptions(screen.getByLabelText('選擇組別'),ids.team1);await user.click(screen.getByRole('button',{name:'加入活動'}));
 expect(await screen.findByText('活動已開啟')).toBeTruthy();
});
it('shows lookup errors without offering Team creation',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:404,json:async()=>({error:{code:'SESSION_NOT_FOUND',message:'找不到活動'}})})));show();
 await userEvent.type(screen.getByLabelText('活動代號'),'BAD');await userEvent.click(screen.getByRole('button',{name:'查詢活動'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('找不到活動');expect(screen.queryByText('建立組別')).toBeNull();
});
it('restores an existing membership after code lookup instead of creating another Participant',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:unknown)=>({ok:true,json:async()=>({data:String(url).includes('join-options')?{sessionId:ids.session1,phase:'Waiting',teams:[{teamId:ids.team1,name:'Team A'}]}:String(url).includes('/me')?member:{sessionId:ids.session1,phase:'Waiting'}})})));show();
 await userEvent.type(screen.getByLabelText('活動代號'),'CODE');await userEvent.click(screen.getByRole('button',{name:'查詢活動'}));
 expect(await screen.findByRole('button',{name:'繼續活動'})).toBeTruthy();expect(screen.queryByLabelText('顯示名稱')).toBeNull();
});
it('keeps join input and shows a server-side Team validation error',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:unknown,options?:RequestInit)=>{
  const path=String(url);if(path.includes('/me')||path.includes('csrf-token'))return {ok:false,status:401,json:async()=>({error:{code:'UNAUTHENTICATED',message:'尚未加入'}})};
  if(options?.method==='POST')return {ok:false,status:400,json:async()=>({error:{code:'INVALID_INPUT',message:'選擇的組別無效'}})};
  return {ok:true,json:async()=>({data:{sessionId:ids.session1,phase:'Waiting',teams:[{teamId:ids.team1,name:'Team A'}]}})};
 }));show();await userEvent.type(screen.getByLabelText('活動代號'),'CODE');await userEvent.click(screen.getByRole('button',{name:'查詢活動'}));await screen.findByLabelText('顯示名稱');
 await userEvent.type(screen.getByLabelText('顯示名稱'),'Alice');await userEvent.selectOptions(screen.getByLabelText('選擇組別'),ids.team1);await userEvent.click(screen.getByRole('button',{name:'加入活動'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('選擇的組別無效');expect(screen.getByLabelText('顯示名稱')).toHaveValue('Alice');
});
