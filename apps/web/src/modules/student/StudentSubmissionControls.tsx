export function StudentSubmissionControls({isLeader,locked,busy,complete,ready,onSubmit}:{isLeader:boolean;locked:boolean;busy:boolean;complete:boolean;ready:boolean;onSubmit:()=>void}){
 if(locked)return <p role="status" className="rounded-lg bg-emerald-50 p-4 font-semibold text-emerald-800">本組已提交，草稿為唯讀。</p>;
 return <div className="mt-5 space-y-2">{!complete&&<p>請完成所有填空，答案不能只有空白字元。</p>}{busy&&<p role="status">正在儲存或提交，請稍候…</p>}
  {isLeader?<button type="button" className="min-h-11 rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={!ready||busy||!complete} onClick={onSubmit}>提交本組答案</button>:<p>一般組員可共同編輯，請由組長提交本組答案。</p>}
 </div>;
}
