import { useEffect,useRef,useState } from 'react';
import type { QuestionView,UUID } from '@quiz/contracts/domain';
import { studentError } from './student-identity-client.js';
interface EditorProps {questions:QuestionView[];values:Record<string,string>;disabled:boolean;onEdit:(blankId:UUID,value:string)=>Promise<void>;onDirty:(blankId:UUID,dirty:boolean)=>void;}
function BlankInput({id,label,value,disabled,onEdit,onDirty}:{id:UUID;label:string;value:string;disabled:boolean;onEdit:EditorProps['onEdit'];onDirty:EditorProps['onDirty']}){
 const [local,setLocal]=useState(value),[focused,setFocused]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState('');const sequence=useRef(0),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!focused&&!dirty)setLocal(value);},[value,focused,dirty]);
 useEffect(()=>{onDirty(id,dirty||(focused&&local!==value));},[id,dirty,focused,local,value,onDirty]);
 async function save(next:string){const seq=++sequence.current;setDirty(true);onDirty(id,true);setError('');
  try{await onEdit(id,next);if(alive.current&&seq===sequence.current){setDirty(false);onDirty(id,false);}}
  catch(e){if(alive.current&&seq===sequence.current)setError(studentError(e));}}
 return <div className="min-w-0"><label className="block font-medium" htmlFor={`blank-${id}`}>{label}</label>
  <input id={`blank-${id}`} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 focus:outline-indigo-700 disabled:bg-slate-100" value={local} disabled={disabled} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChange={e=>{setLocal(e.target.value);void save(e.target.value);}} aria-describedby={`hint-${id}`}/>
  <p id={`hint-${id}`} className="mt-1 text-sm text-slate-600">{dirty?'尚有未儲存的輸入':focused&&local!==value?'同組答案已更新；目前輸入保留，離開欄位後會顯示最新內容。':'已同步'}</p>
  {error&&<div role="alert" className="text-sm text-red-700">{error} <button type="button" className="min-h-11 underline" disabled={disabled} onClick={()=>void save(local)}>重試儲存</button></div>}
 </div>;
}
export function StudentTargetEditor({questions,values,disabled,onEdit,onDirty}:EditorProps){
 return <div className="space-y-5">{questions.map(q=><fieldset key={q.id} className="min-w-0 space-y-4 rounded-xl border border-slate-200 p-4"><legend className="px-2 font-semibold">{q.displayNumber?`題目 ${q.displayNumber}`:'題目'}</legend><p className="whitespace-pre-wrap break-words">{q.prompt}</p>
  {q.blanks.map((blank,index)=><BlankInput key={blank.id} id={blank.id} label={blank.label??`填空 ${index+1}`} value={values[blank.id]??''} disabled={disabled} onEdit={onEdit} onDirty={onDirty}/>)}{!q.blanks.length&&<p>此題沒有可作答欄位。</p>}
 </fieldset>)}</div>;
}
