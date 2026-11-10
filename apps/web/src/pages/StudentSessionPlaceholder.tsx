import { useEffect,useState,useCallback,useRef } from 'react';
import { Link,useParams } from 'react-router-dom';
import { PlaceholderPage } from './PlaceholderPage.js';
import { useStudentSessionStatus } from '../modules/student/student-session-state.js';
import { parseUUID,type UUID,type CurrentTargetView } from '@quiz/contracts/domain';
import { recoverStudentIdentity,studentRequest,studentError,type StudentIdentity } from '../modules/student/student-identity-client.js';
import { StudentMembershipPanel } from '../modules/student/StudentMembershipPanel.js';
import { StudentDraftPanel } from '../modules/student/StudentDraftPanel.js';

function ActiveRound({sessionId,roundId,identity,connected,onIdentityRefresh}:{sessionId:UUID;roundId:UUID;identity:StudentIdentity;connected:boolean;onIdentityRefresh:()=>void}){
 const [target,setTarget]=useState<CurrentTargetView|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const abort=new AbortController();setTarget(null);setError('');studentRequest<CurrentTargetView>(`/api/v1/sessions/${sessionId}/current-target`,{signal:abort.signal}).then(value=>{if(!abort.signal.aborted&&value?.roundId===roundId)setTarget(value);}).catch(e=>{if(!abort.signal.aborted)setError(studentError(e));});return()=>abort.abort();},[sessionId,roundId,retry]);
 return error?<div role="alert">{error} <button className="min-h-11 underline" onClick={()=>setRetry(n=>n+1)}>重試載入題目</button></div>:target?<StudentDraftPanel key={`${identity.membership.team.teamId}:${roundId}`} sessionId={sessionId} roundId={roundId} target={target} membership={identity.membership} csrfToken={identity.csrfToken} activityConnected={connected} onIdentityRefresh={onIdentityRefresh}/>:<p role="status">正在載入目前題目…</p>;
}
function RoundResult({sessionId,roundId}:{sessionId:UUID;roundId:UUID}){
 const [result,setResult]=useState<{winner:null|{teamName:string;answers:{blankId:UUID;label:string|null;value:string}[]}}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const abort=new AbortController();setError('');setResult(null);studentRequest<NonNullable<typeof result>>(`/api/v1/student/sessions/${sessionId}/rounds/${roundId}/result`,{signal:abort.signal}).then(value=>{if(!abort.signal.aborted)setResult(value);}).catch(e=>{if(!abort.signal.aborted)setError(studentError(e));});return()=>abort.abort();},[sessionId,roundId,retry]);
 return <section className="mt-5 space-y-4" aria-label="本輪結果"><h2 className="text-xl font-semibold">本輪搶答已結束</h2>{error?<p role="alert">{error} <button className="min-h-11 underline" onClick={()=>setRetry(n=>n+1)}>重試查詢結果</button></p>:!result?<p role="status">正在取得已公布結果…</p>:result.winner?<><p>勝出組別：<strong>{result.winner.teamName}</strong></p><dl className="space-y-3">{result.winner.answers.map((answer,index)=><div key={answer.blankId} className="rounded-lg bg-slate-50 p-3"><dt>{answer.label??`填空 ${index+1}`}</dt><dd className="whitespace-pre-wrap break-words font-medium">{answer.value}</dd></div>)}</dl></>:<p>本輪無勝出組別。</p>}</section>;
}

export function StudentSessionPlaceholder() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const id=parseUUID(sessionId);const [identity,setIdentity]=useState<StudentIdentity|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const currentId=useRef(id);currentId.current=id;
  useEffect(()=>{let alive=true;setIdentity(null);setError('');if(!id){setError('活動識別碼無效，請由加入頁進入。');return;}
   recoverStudentIdentity(id).then(value=>{if(alive)setIdentity(value);}).catch(e=>{if(alive)setError(studentError(e));});return()=>{alive=false;};
  },[id,retry]);
  const {snapshot:state,connected}=useStudentSessionStatus(identity?(id??undefined):undefined);
  const refreshIdentity=useCallback(()=>{if(id)void recoverStudentIdentity(id).then(value=>{if(currentId.current===id){setIdentity(value);setError('');}}).catch(e=>{if(currentId.current===id)setError(studentError(e));});},[id]);
  useEffect(()=>{if(connected&&identity)refreshIdentity();},[connected,refreshIdentity]);

  return (
    <PlaceholderPage
      title="學生活動頁面"
      moduleName="學生端"
      description="查看活動狀態，與同組組員共同填答，並由組長提交本組答案。"
    >
      <dl className="mt-5 rounded-lg bg-slate-50 p-4">
        <dt className="text-sm font-medium text-slate-500">活動識別碼（Session ID）</dt>
        <dd className="mt-1 break-all font-mono text-sm text-slate-900">{sessionId}</dd>
        <dt className="mt-3 text-sm font-medium text-slate-500">活動階段</dt>
        <dd aria-live="polite">{state?.phase ?? '等待取得活動狀態'}</dd>
        <dt className="mt-3 text-sm font-medium text-slate-500">目前輪次</dt>
        <dd className="break-all font-mono text-sm">{state?.currentRoundId ?? '尚未取得輪次'}</dd>
      </dl>
      {error?<div className="mt-4" role="alert"><p>{error}</p><button className="mr-4 min-h-11 underline" onClick={()=>setRetry(n=>n+1)}>重新恢復身分</button><Link className="underline" to="/student/join">返回加入活動</Link></div>:!identity?<p role="status">正在恢復學生身分…</p>:<>
       <StudentMembershipPanel membership={identity.membership}/><button className="min-h-11 underline" onClick={refreshIdentity}>重新載入身分</button>
       <p role="status" className="my-3">{connected?'活動即時連線正常':'連線中斷或連線中，正在恢復活動狀態。'}</p>
       {state?.phase==='Waiting'?<h2 className="my-5 text-xl font-semibold">等待老師開始</h2>:state?.phase==='Active'&&id?<ActiveRound key={state.currentRoundId} sessionId={id} roundId={state.currentRoundId} identity={identity} connected={connected} onIdentityRefresh={refreshIdentity}/>:state?.phase==='Ended'&&id?<RoundResult key={state.currentRoundId} sessionId={id} roundId={state.currentRoundId}/>:<p>正在取得伺服器活動狀態…</p>}
      </>}
    </PlaceholderPage>
  );
}
