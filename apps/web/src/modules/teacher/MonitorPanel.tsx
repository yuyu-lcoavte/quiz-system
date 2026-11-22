import { useEffect, useRef, useState } from 'react';
import type { TeacherMonitorView } from '@quiz/contracts';
import type { RoundPhase, UUID } from '@quiz/contracts/domain';
import { displayError } from './teacher-api-client.js';
import { secondaryButton } from './use-teacher-api.js';

export const MONITOR_POLL_MS = 1000;

interface MonitorPanelProps {
  readonly phase: RoundPhase;
  readonly roundId: UUID;
  readonly load: () => Promise<TeacherMonitorView>;
}

/**
 * Live submissions for the current Round (FR-022): polls every second while Active (research.md R6).
 * Answers are hidden by default so a projected screen does not leak them; never shows drafts.
 */
export function MonitorPanel({ phase, roundId, load }: MonitorPanelProps) {
  const [view, setView] = useState<TeacherMonitorView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await loadRef.current();
        if (active) { setView(next); setError(null); }
      } catch (caught) {
        if (active) setError(displayError(caught));
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const timer = phase === 'Active' ? setInterval(() => { void refresh(); }, MONITOR_POLL_MS) : undefined;
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [phase, roundId]);

  useEffect(() => { setShowAnswers(false); }, [roundId]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">作答狀況</h2>
        <button type="button" className={secondaryButton} onClick={() => setShowAnswers((value) => !value)}>
          {showAnswers ? '隱藏答案' : '顯示答案'}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
      {view && (
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 text-sm text-slate-600"><th className="py-2">組別</th><th>狀態</th><th>順位</th><th>答案</th></tr>
          </thead>
          <tbody>
            {view.teams.map((team) => (
              <tr key={team.teamId} className="border-b border-slate-100">
                <td className="py-2 font-semibold">{team.teamName}</td>
                <td>{team.submitted ? '已送出' : '未送出'}</td>
                <td>{team.acceptedOrder === null ? '—' : `第 ${team.acceptedOrder} 名`}</td>
                <td>{!team.submitted ? '' : showAnswers
                  ? team.answers.map((answer) => `${answer.label ?? ''}${answer.value}`).join('；')
                  : '（已隱藏）'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
