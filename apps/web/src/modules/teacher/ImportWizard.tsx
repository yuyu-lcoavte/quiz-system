import { useState, type FormEvent } from 'react';
import type { ImportPreviewView } from '@quiz/contracts';
import { displayError } from './teacher-api-client.js';
import { primaryButton, secondaryButton } from './use-teacher-api.js';

interface ImportWizardProps {
  /** null when the server has no Google service account configured. */
  readonly serviceAccountEmail: string | null;
  /** True once the activity has a Round: questions can no longer be replaced. */
  readonly locked: boolean;
  readonly preview: (url: string) => Promise<ImportPreviewView>;
  readonly confirm: (url: string, previewDigest: string) => Promise<unknown>;
  readonly onImported: () => void;
}

/** Paste a Google Sheets URL → preview numbers/groups/blank cells (nothing saved) → confirm (FR-025–FR-031). */
export function ImportWizard({ serviceAccountEmail, locked, preview, confirm, onImported }: ImportWizardProps) {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<{ url: string; view: ImportPreviewView } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!serviceAccountEmail) {
    return <p className="text-slate-600">伺服器尚未設定 Google 服務帳號，無法匯入 Guided Notes。</p>;
  }
  if (locked) {
    return <p className="text-slate-600">活動已開始搶答，不能再匯入題目。如需不同題目，請建立新活動。</p>;
  }

  async function runPreview(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult({ url, view: await preview(url.trim()) });
    } catch (caught) {
      setError(displayError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function runConfirm() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      await confirm(result.url.trim(), result.view.previewDigest);
      setResult(null);
      setUrl('');
      onImported();
    } catch (caught) {
      setError(displayError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-6 text-slate-700">
        <li>在 Google 試算表按「共用」，把下列服務帳號加入為「編輯者」：
          <span className="ml-1 break-all font-mono font-semibold">{serviceAccountEmail}</span></li>
        <li>複製要匯入的分頁網址（網址中的分頁會被匯入；沒有指定時匯入第一個分頁）。</li>
        <li>貼上網址並預覽，確認題號與填空位置正確後再匯入。</li>
      </ol>
      <form className="flex flex-wrap items-end gap-3" onSubmit={runPreview}>
        <div className="min-w-0 flex-1 space-y-2">
          <label htmlFor="sheet-url" className="block font-medium">試算表網址</label>
          <input
            id="sheet-url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="https://docs.google.com/spreadsheets/d/…"
          />
        </div>
        <button type="submit" className={secondaryButton} disabled={busy || url.trim().length === 0}>預覽</button>
      </form>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {result && (
        <div className="space-y-3">
          <p className="font-semibold">分頁「{result.view.sheetTitle}」・共 {result.view.questionNumberCount} 題</p>
          {result.view.warnings.length > 0 && (
            <ul className="list-disc pl-6 text-amber-700">{result.view.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          )}
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 text-sm text-slate-600"><th className="py-2">題號</th><th>類型</th><th>填空儲存格</th></tr>
            </thead>
            <tbody>
              {result.view.targets.map((target) => (
                <tr key={target.number} className="border-b border-slate-100 align-top">
                  <td className="py-2 font-semibold">{target.number}</td>
                  <td>{target.kind === 'questionGroup' ? `題組（${target.questions.length} 題）` : '單題'}</td>
                  <td>{target.questions.map((question) =>
                    question.blanks.map((blank) => `${blank.cellA1}${blank.marker ?? ''}`).join('、')).join('；')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-3">
            <button type="button" className={primaryButton} disabled={busy} onClick={runConfirm}>確認匯入</button>
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => setResult(null)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
