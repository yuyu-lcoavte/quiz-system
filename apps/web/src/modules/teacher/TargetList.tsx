import type { TargetStatusView } from '@quiz/contracts';
import { PHASE_LABELS, secondaryButton } from './use-teacher-api.js';

interface TargetListProps {
  readonly targets: readonly TargetStatusView[];
  /** True when no Round is current or the current Round has Ended (Foundation rule). */
  readonly canSelect: boolean;
  readonly busy: boolean;
  readonly onSelect: (target: TargetStatusView) => void;
}

/** Target list with status; an Ended target can be reopened (new Round, new result replaces the old one). */
export function TargetList({ targets, canSelect, busy, onSelect }: TargetListProps) {
  if (targets.length === 0) return <p className="mt-2 text-slate-600">尚未匯入題目。</p>;
  return (
    <table className="mt-2 w-full text-left">
      <thead>
        <tr className="border-b border-slate-200 text-sm text-slate-600">
          <th className="py-2">題號</th><th>類型</th><th>狀態</th><th>輪次</th><th><span className="sr-only">操作</span></th>
        </tr>
      </thead>
      <tbody>
        {targets.map((target) => {
          const id = target.target.kind === 'question' ? target.target.questionId : target.target.questionGroupId;
          const action = target.status === 'NotOpened' ? '開放' : target.status === 'Ended' ? '重新開題' : null;
          return (
            <tr key={id} className="border-b border-slate-100">
              <td className="py-2 font-semibold">{target.number}</td>
              <td>{target.kind === 'questionGroup' ? `題組（${target.questionCount} 題）` : `單題（${target.blankCount} 格）`}</td>
              <td>{PHASE_LABELS[target.status]}</td>
              <td>{target.roundCount}</td>
              <td className="py-1 text-right">
                {action && (
                  <button type="button" className={secondaryButton} disabled={!canSelect || busy} onClick={() => onSelect(target)}>
                    {action}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
