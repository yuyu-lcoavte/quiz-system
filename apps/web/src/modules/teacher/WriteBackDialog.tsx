import { useState } from 'react';
import type { WriteBackPlanView } from '@quiz/contracts';
import { displayError } from './teacher-api-client.js';
import { primaryButton, secondaryButton } from './use-teacher-api.js';

interface WriteBackDialogProps {
  readonly preview: () => Promise<WriteBackPlanView>;
  readonly confirm: (planDigest: string) => Promise<{ written: number }>;
}

/** One write-back of all winners (and restores): list every cell first, write only after 確認寫入 (FR-033–FR-036). */
export function WriteBackDialog({ preview, confirm }: WriteBackDialogProps) {
  const [plan, setPlan] = useState<WriteBackPlanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setPlan(await preview());
    } catch (caught) {
      setPlan(null);
      setError(displayError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function write() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const { written } = await confirm(plan.planDigest);
      setPlan(null);
      setDone(`已寫入 ${written} 格。`);
    } catch (caught) {
      setError(displayError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button type="button" className={secondaryButton} disabled={busy} onClick={load}>寫回 Guided Notes</button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {done && <p role="status" className="text-green-700">{done}</p>}
      {plan && (
        <div className="space-y-3">
          <p className="text-slate-700">以下儲存格將寫入原試算表（共 {plan.entries.length} 格），請確認：</p>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 text-sm text-slate-600">
                <th className="py-2">題號</th><th>儲存格</th><th>目前內容</th><th>寫入後</th><th>動作</th>
              </tr>
            </thead>
            <tbody>
              {plan.entries.map((entry) => (
                <tr key={entry.cellA1} className="border-b border-slate-100">
                  <td className="py-2">{entry.number}</td>
                  <td className="font-mono">{entry.cellA1}</td>
                  <td>{entry.currentContent || '（空白）'}</td>
                  <td className="font-semibold">{entry.newContent || '（空白）'}</td>
                  <td>{entry.kind === 'write' ? '寫入' : '還原'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-3">
            <button type="button" className={primaryButton} disabled={busy} onClick={write}>確認寫入</button>
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => setPlan(null)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
