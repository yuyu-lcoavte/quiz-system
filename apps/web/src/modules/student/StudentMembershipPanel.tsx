import type { StudentMembershipView } from '@quiz/contracts';
export function StudentMembershipPanel({membership}:{membership:StudentMembershipView}){
 return <dl className="my-5 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
  <div><dt className="text-sm text-slate-500">目前組別</dt><dd className="font-semibold">{membership.team.name}</dd></div>
  <div><dt className="text-sm text-slate-500">學生</dt><dd>{membership.displayName??'已驗證學生身分'}</dd></div>
  <div><dt className="text-sm text-slate-500">組內資格</dt><dd>{membership.isLeader?'組長（可提交）':'一般組員（共同編輯）'}</dd></div>
 </dl>;
}
