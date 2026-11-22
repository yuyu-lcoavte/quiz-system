import type { SessionStateSnapshot } from '@quiz/contracts/domain';
import { PHASE_LABELS, primaryButton, secondaryButton } from './use-teacher-api.js';

interface RoundControlPanelProps {
  readonly state: SessionStateSnapshot;
  readonly busy: boolean;
  readonly onNext: () => void;
  readonly onStart: () => void;
  readonly onEnd: () => void;
}

/** Buttons are enabled only in the phase where Foundation accepts the command; the server still checks. */
export function RoundControlPanel({ state, busy, onNext, onStart, onEnd }: RoundControlPanelProps) {
  const canSelect = state.currentRoundId === null || state.phase === 'Ended';
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <span className="font-medium">目前階段：{state.currentRoundId === null ? '尚未開題' : PHASE_LABELS[state.phase]}</span>
      <button type="button" className={secondaryButton} disabled={busy || !canSelect} onClick={onNext}>下一題</button>
      <button type="button" className={primaryButton} disabled={busy || state.phase !== 'Waiting' || state.currentRoundId === null} onClick={onStart}>開始搶答</button>
      <button type="button" className={primaryButton} disabled={busy || state.phase !== 'Active'} onClick={onEnd}>結束搶答</button>
    </div>
  );
}
