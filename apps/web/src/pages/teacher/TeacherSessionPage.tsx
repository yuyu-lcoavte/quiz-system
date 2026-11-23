import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { TargetStatusView, TeacherSessionView } from '@quiz/contracts';
import { parseUUID, type UUID } from '@quiz/contracts/domain';
import { ImportWizard } from '../../modules/teacher/ImportWizard.js';
import { MonitorPanel } from '../../modules/teacher/MonitorPanel.js';
import { ResultsPanel } from '../../modules/teacher/ResultsPanel.js';
import { RoundControlPanel } from '../../modules/teacher/RoundControlPanel.js';
import { TargetList } from '../../modules/teacher/TargetList.js';
import { WriteBackDialog } from '../../modules/teacher/WriteBackDialog.js';
import { displayError, isConflict, TeacherApiError } from '../../modules/teacher/teacher-api-client.js';
import { secondaryButton, useTeacherApi } from '../../modules/teacher/use-teacher-api.js';
import { createSessionStateClient, type SessionStateClient } from '../../services/session-state-client.js';

interface TeacherSessionPageProps {
  /** Injected in tests; defaults to the shared Foundation Socket client (no auth.sessionId → Teacher path). */
  readonly createStateClient?: (sessionId: UUID) => SessionStateClient;
}

export function TeacherSessionPage({ createStateClient = createSessionStateClient }: TeacherSessionPageProps) {
  const api = useTeacherApi();
  const sessionId = parseUUID(useParams().sessionId);
  const [view, setView] = useState<TeacherSessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latestVersion = useRef(-1);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!sessionId) return;
    try {
      const next = await api.getSession(sessionId);
      latestVersion.current = next.state.stateVersion;
      setView(next);
    } catch (caught) {
      if (!(caught instanceof TeacherApiError && caught.status === 401)) setError(displayError(caught));
    }
  }, [api, sessionId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    let active = true;
    api.me().then((me) => { if (active) setServiceAccountEmail(me.serviceAccountEmail); }).catch(() => undefined);
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!sessionId) return undefined;
    const client = createStateClient(sessionId);
    const unsubscribe = client.subscribe((snapshot) => {
      if (snapshot.stateVersion > latestVersion.current) void reload();
    });
    return () => { unsubscribe(); client.dispose(); };
  }, [createStateClient, reload, sessionId]);

  async function run(command: (version: number) => Promise<unknown>) {
    if (!view) return;
    setBusy(true);
    setError(null);
    try {
      await command(view.state.stateVersion);
    } catch (caught) {
      setError(displayError(caught));
      if (!isConflict(caught)) return;
    } finally {
      setBusy(false);
    }
    await reload();
  }

  if (!sessionId) return <p role="alert" className="text-red-700">活動識別碼無效。</p>;

  const canSelect = view ? view.state.currentRoundId === null || view.state.phase === 'Ended' : false;
  const select = (target: TargetStatusView) => run((version) => api.selectTarget(sessionId, target.target, version));

  return (
    <section className="mx-auto max-w-4xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-700">目前模組：老師端</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">活動管理</h1>
        </div>
        <Link to="/teacher/dashboard" className={secondaryButton}>返回活動清單</Link>
      </div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!view && !error && <p className="text-slate-600">讀取中…</p>}
      {view && (
        <>
          <div className="flex flex-wrap gap-6">
            <p>活動代號 <span className="ml-2 font-mono text-3xl font-bold">{view.activityCode}</span></p>
            <p className="self-end text-slate-600">組別：{view.teams.map((team) => team.name).join('、')}</p>
          </div>
          <RoundControlPanel
            state={view.state}
            busy={busy}
            onNext={() => run((version) => api.next(sessionId, version))}
            onStart={() => run((version) => api.start(sessionId, version))}
            onEnd={() => run((version) => api.end(sessionId, version))}
          />
          {view.state.currentRoundId && (
            <MonitorPanel phase={view.state.phase} roundId={view.state.currentRoundId} load={() => api.monitor(sessionId)} />
          )}
          {view.state.currentRoundId && (
            <ResultsPanel phase={view.state.phase} roundId={view.state.currentRoundId} load={() => api.results(sessionId, view.state.currentRoundId!)} />
          )}
          <div>
            <h2 className="text-xl font-semibold">題目</h2>
            <TargetList targets={view.targets} canSelect={canSelect} busy={busy} onSelect={select} />
          </div>
          <div>
            <h2 className="text-xl font-semibold">匯入 Guided Notes</h2>
            {view.source && (
              <p className="mt-1 text-sm text-slate-600">已匯入：分頁「{view.source.sheetTitle}」（{new Date(view.source.importedAt).toLocaleString('zh-TW')}）</p>
            )}
            {view.source && (
              <div className="mt-2">
                <WriteBackDialog
                  preview={() => api.writeBackPreview(sessionId)}
                  confirm={(digest) => api.writeBackConfirm(sessionId, digest)}
                />
              </div>
            )}
            <div className="mt-2">
              <ImportWizard
                serviceAccountEmail={serviceAccountEmail}
                locked={view.state.currentRoundId !== null}
                preview={(url) => api.importPreview(sessionId, url)}
                confirm={(url, digest) => api.importConfirm(sessionId, url, digest)}
                onImported={() => { void reload(); }}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
