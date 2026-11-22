import { useEffect, useRef, useState } from 'react';
import type { TeacherAnswerView, TeacherResultView } from '@quiz/contracts';
import type { RoundPhase, UUID } from '@quiz/contracts/domain';
import { displayError } from './teacher-api-client.js';

interface ResultsPanelProps {
  readonly phase: RoundPhase;
  readonly roundId: UUID;
  readonly load: () => Promise<TeacherResultView>;
}

const joinAnswers = (answers: readonly TeacherAnswerView[]) => answers.map((answer) => `${answer.label ?? ''}${answer.value}`).join('；');

/** After End: full order, winner and answers, or 無勝者 (FR-024). Loads only once the Round has Ended. */
export function ResultsPanel({ phase, roundId, load }: ResultsPanelProps) {
  const [result, setResult] = useState<TeacherResultView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setResult(null);
    if (phase !== 'Ended') return undefined;
    let active = true;
    loadRef.current()
      .then((next) => { if (active) { setResult(next); setError(null); } })
      .catch((caught) => { if (active) setError(displayError(caught)); });
    return () => { active = false; };
  }, [phase, roundId]);

  if (phase !== 'Ended') return null;
  return (
    <div>
      <h2 className="text-xl font-semibold">搶答結果</h2>
      {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
      {result && (
        <>
          <p className="mt-2 text-lg font-semibold">
            {result.winner ? `勝出：${result.winner.teamName}（${joinAnswers(result.winner.answers)}）` : '無勝者'}
          </p>
          <p className="text-sm text-slate-600">題號 {result.number}・第 {result.roundNumber} 輪</p>
          {result.submissions.length > 0 && (
            <table className="mt-2 w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-sm text-slate-600"><th className="py-2">順位</th><th>組別</th><th>答案</th></tr>
              </thead>
              <tbody>
                {result.submissions.map((submission) => (
                  <tr key={submission.teamId} className="border-b border-slate-100">
                    <td className="py-2">第 {submission.acceptedOrder} 名</td>
                    <td className="font-semibold">{submission.teamName}</td>
                    <td>{joinAnswers(submission.answers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
