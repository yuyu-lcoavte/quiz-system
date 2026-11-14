import { useId, useState } from 'react';
import type { StudentMembershipDetails } from '@quiz/contracts';
import { parseUUID, type UUID } from '@quiz/contracts/domain';

export function StudentTeamChangeForm({ membership, busy, disabled, onChange }: {
  membership: StudentMembershipDetails;
  busy: boolean;
  disabled: boolean;
  onChange: (teamId: UUID) => void;
}) {
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState('');
  const id = useId();
  const options = membership.teamChange;
  if (!options?.teams.length) return null;

  const teamId = parseUUID(team);
  const canMove = teamId && options.teams.some(choice => choice.teamId === teamId);
  return open ? (
    <form className="mt-2 grid gap-2 text-sm font-normal" onSubmit={event => {
      event.preventDefault();
      if (canMove && teamId && !disabled && !busy) onChange(teamId);
    }}>
      <label htmlFor={id}>新組別</label>
      <select id={id} className="min-h-11 w-full rounded border border-slate-400 bg-white p-2" value={team} onChange={event => setTeam(event.target.value)} disabled={disabled || busy} required>
        <option value="">選擇組別</option>
        {options.teams.map(choice => <option key={choice.teamId} value={choice.teamId}>{choice.name}</option>)}
      </select>
      {membership.isLeader && <p>換組後，原組的組長由系統自動安排。</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="min-h-11 rounded bg-slate-900 px-3 text-white disabled:opacity-50" disabled={!canMove || disabled || busy}>確認更換</button>
        <button type="button" className="min-h-11 px-2 underline" onClick={() => setOpen(false)} disabled={busy}>取消</button>
      </div>
    </form>
  ) : <button className="block min-h-11 text-sm underline" disabled={disabled || busy} onClick={() => setOpen(true)}>更換組別</button>;
}
