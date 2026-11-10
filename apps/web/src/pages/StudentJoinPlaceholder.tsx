import { useRef,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlaceholderPage } from './PlaceholderPage.js';
import { lookupStudentActivity,enrollStudent,studentRequest,studentError,StudentApiError,type JoinOptions } from '../modules/student/student-identity-client.js';
import type { StudentMembershipView } from '@quiz/contracts';
import { StudentMembershipPanel } from '../modules/student/StudentMembershipPanel.js';
export function StudentJoinPlaceholder(){
 const navigate=useNavigate();const [code,setCode]=useState(''),[name,setName]=useState(''),[team,setTeam]=useState('');
 const [options,setOptions]=useState<JoinOptions|null>(null),[existing,setExisting]=useState<StudentMembershipView|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const inFlight=useRef(false);
 async function lookup(){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setOptions(null);setExisting(null);
  try{const found=await lookupStudentActivity(code);setOptions(found);setTeam('');try{setExisting(await studentRequest<StudentMembershipView>(`/api/v1/student/sessions/${found.sessionId}/me`));}catch(e){if(!(e instanceof StudentApiError)||e.status!==401)throw e;}}
  catch(e){setError(studentError(e));}finally{setBusy(false);inFlight.current=false;}}
 async function join(){if(inFlight.current||!options)return;inFlight.current=true;setBusy(true);setError('');try{await enrollStudent(options.sessionId,team,name);navigate(`/student/session/${options.sessionId}`);}catch(e){setError(studentError(e));}finally{setBusy(false);inFlight.current=false;}}
 const input='mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 focus:outline-indigo-700';const button='min-h-11 rounded-lg bg-indigo-700 px-4 py-2 font-medium text-white disabled:opacity-50';
 return <PlaceholderPage title="學生加入活動" moduleName="學生端" description="輸入老師提供的活動代號，加入既有組別。已加入的身分會透過此瀏覽器安全恢復。">
  <form className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={e=>{e.preventDefault();void lookup();}}><label className="min-w-0 flex-1">活動代號<input className={input} required maxLength={64} autoComplete="off" value={code} onChange={e=>{setCode(e.target.value);setOptions(null);setExisting(null);setError('');}} disabled={busy}/></label><button className={button} disabled={busy}>查詢活動</button></form>
  {busy&&<p role="status">正在處理，請稍候…</p>}{error&&<p role="alert" className="mt-4 text-red-700">{error}</p>}
  {options&&<div className="mt-5"><p>活動階段：{options.phase}</p>{existing?<><StudentMembershipPanel membership={existing}/><button className={button} onClick={()=>navigate(`/student/session/${options.sessionId}`)}>繼續活動</button></>:
   <form className="mt-4 space-y-4" onSubmit={e=>{e.preventDefault();void join();}}>
    <label className="block">顯示名稱<input className={input} required maxLength={100} autoComplete="nickname" value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label>
    <label className="block">選擇組別<select className={input} required value={team} onChange={e=>setTeam(e.target.value)} disabled={busy}><option value="">請選擇既有組別</option>{options.teams.map(t=><option key={t.teamId} value={t.teamId}>{t.name}</option>)}</select></label>
    {!options.teams.length&&<p role="status">老師尚未建立可加入的組別。</p>}<button className={button} disabled={busy||!options.teams.length}>加入活動</button>
   </form>}</div>}
 </PlaceholderPage>;
}
