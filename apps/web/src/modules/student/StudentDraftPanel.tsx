import { useCallback,useEffect,useRef,useState } from 'react';
import { createStudentSocket } from './student-socket.js';
import type { CurrentTargetView,UUID } from '@quiz/contracts/domain';
import type { StudentMembershipView,StudentDraftSnapshotPayload,StudentDraftChangedPayload } from '@quiz/contracts';
import { DraftClient } from './draft-client.js';
import { StudentTargetEditor } from './StudentTargetEditor.js';
import { StudentSubmissionControls } from './StudentSubmissionControls.js';
import { studentRequest,studentError,StudentApiError,targetQuestions } from './student-identity-client.js';

export function StudentDraftPanel({sessionId,roundId,target,membership,csrfToken,activityConnected,onIdentityRefresh}:{sessionId:UUID;roundId:UUID;target:CurrentTargetView;membership:StudentMembershipView;csrfToken:string;activityConnected:boolean;onIdentityRefresh:()=>void}){
 const [snapshot,setSnapshot]=useState<StudentDraftSnapshotPayload|null>(null),[connected,setConnected]=useState(false),[pending,setPending]=useState(0),[dirty,setDirty]=useState<Record<string,boolean>>({});
 const [error,setError]=useState(''),[submitting,setSubmitting]=useState(false),[submitted,setSubmitted]=useState(false),[phaseBlocked,setPhaseBlocked]=useState(false);
 const client=useRef<DraftClient|null>(null),alive=useRef(false),controller=useRef<AbortController|null>(null),token=useRef(csrfToken),queues=useRef(new Map<string,Promise<void>>()),inFlight=useRef(false);
 token.current=csrfToken;
 const ready=connected&&activityConnected&&!phaseBlocked;const readyRef=useRef(ready);readyRef.current=ready;
 const base=`/api/v1/student/sessions/${sessionId}/rounds/${roundId}`;
 useEffect(()=>{
  alive.current=true;controller.current=new AbortController();setSnapshot(null);setConnected(false);setError('');setSubmitted(false);setPhaseBlocked(false);setDirty({});queues.current.clear();
  const socket=createStudentSocket(sessionId,{autoConnect:false});
  const adapter=new DraftClient({sessionId,roundId},socket,{csrfToken:()=>token.current,fetchSnapshot:()=>studentRequest(`${base}/draft`,{signal:controller.current!.signal}),onError:e=>{if(alive.current)setError(studentError(e));}});client.current=adapter;
  const unsubscribe=adapter.subscribe(value=>{if(alive.current)setSnapshot(value);});
  socket.on('connect',()=>{if(alive.current)setConnected(true);});socket.on('disconnect',()=>{if(alive.current)setConnected(false);});
  socket.on('connect_error',()=>{if(alive.current){setConnected(false);setError('即時連線無法建立，請重新載入身分。');}});
  socket.on('student:draft:error',e=>{if(alive.current)setError(e.message);});adapter.start();socket.connect();void adapter.refresh();
  return()=>{alive.current=false;controller.current?.abort();unsubscribe();adapter.stop();socket.disconnect();client.current=null;};
 },[sessionId,roundId,base]);
 const onDirty=useCallback((id:UUID,value:boolean)=>setDirty(previous=>({...previous,[id]:value})),[]);
 const edit=useCallback((blankId:UUID,value:string):Promise<void>=>{
  const mutationId=crypto.randomUUID();setPending(n=>n+1);
  const previous=queues.current.get(blankId)??Promise.resolve();
  const job=previous.catch(()=>{}).then(async()=>{
   if(!alive.current||!readyRef.current)throw Error('連線尚未恢復，請保留輸入並重試儲存。');
   const change=await studentRequest<StudentDraftChangedPayload>(`${base}/draft/answers/${blankId}`,{method:'PUT',signal:controller.current!.signal,headers:{'X-CSRF-Token':token.current},body:JSON.stringify({value,baseVersion:client.current?.snapshot?.version??0,clientMutationId:mutationId})});
   if(alive.current){const adapter=client.current;adapter?.acceptHttpChange(change);if((adapter?.snapshot?.version??-1)<change.version)await adapter?.refresh();if((adapter?.snapshot?.version??-1)<change.version)throw Error('尚未取得完整草稿，請保留輸入並重試。');setError('');}
  }).finally(()=>{if(alive.current)setPending(n=>n-1);});queues.current.set(blankId,job);return job;
 },[base]);
 const questions=targetQuestions(target),required=questions.flatMap(q=>q.blanks),values=Object.fromEntries(snapshot?.answers.map(a=>[a.blankId,a.value])??[]);
 const locked=submitted||snapshot?.status==='locked',unsaved=Object.values(dirty).some(Boolean);
 const complete=required.length>0&&required.every(blank=>(values[blank.id]??'').trim().length>0);
 async function submit(){
  if(inFlight.current||!ready||locked||pending||unsaved||!complete||!membership.isLeader)return;
  inFlight.current=true;setSubmitting(true);setError('');
  try{await studentRequest(`${base}/submissions`,{method:'POST',signal:controller.current!.signal,headers:{'X-CSRF-Token':token.current},body:JSON.stringify({answers:required.map(blank=>({blankId:blank.id,value:values[blank.id]}))})});if(alive.current){setSubmitted(true);void client.current?.refresh();}}
  catch(e){if(alive.current){setError(studentError(e));if(e instanceof StudentApiError){if(e.code==='DUPLICATE_SUBMISSION')setSubmitted(true);if(e.code==='INVALID_PHASE')setPhaseBlocked(true);if(e.status===401||e.status===403)onIdentityRefresh();}void client.current?.refresh();}}
  finally{inFlight.current=false;if(alive.current)setSubmitting(false);}
 }
 return <section className="mt-5 space-y-4" aria-label="本組共同草稿"><p role="status">{ready?'即時連線正常':'連線中斷或同步中；暫停作答，輸入會保留。'}{snapshot&&` · 草稿版本 ${snapshot.version}`}</p>
  {error&&<p role="alert" className="text-red-700">{error}</p>}{!snapshot?<p>正在恢復本組草稿…</p>:<>
   <StudentTargetEditor questions={questions} values={values} disabled={!ready||locked||submitting} onEdit={edit} onDirty={onDirty}/>
   <StudentSubmissionControls isLeader={membership.isLeader} locked={locked} busy={!!pending||submitting} complete={complete} ready={ready&&!unsaved} onSubmit={()=>void submit()}/>
  </>}
 </section>;
}
