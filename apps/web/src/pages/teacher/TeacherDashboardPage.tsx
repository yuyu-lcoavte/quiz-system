import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ActivitySummary } from '@quiz/contracts';
import { displayError, TeacherApiError } from '../../modules/teacher/teacher-api-client.js';
import { PHASE_LABELS, primaryButton, secondaryButton, useTeacherApi } from '../../modules/teacher/use-teacher-api.js';
import { PlaceholderPage } from '../PlaceholderPage.js';

export function TeacherDashboardPage() {
  const api = useTeacherApi();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ActivitySummary[] | null>(null);
  const [teamCount, setTeamCount] = useState('2');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.listSessions()
      .then((list) => { if (active) setActivities(list); })
      .catch((caught) => { if (active && !(caught instanceof TeacherApiError && caught.status === 401)) setError(displayError(caught)); });
    return () => { active = false; };
  }, [api]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createSession(Number(teamCount));
      navigate(`/teacher/sessions/${created.sessionId}`);
    } catch (caught) {
      setError(displayError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try { await api.logout(); } finally { navigate('/teacher/login'); }
  }

  return (
    <PlaceholderPage title="老師管理入口" moduleName="老師端" description="建立搶答活動，或進入既有活動管理題目與搶答。">
      <form className="mt-6 flex flex-wrap items-end gap-3" onSubmit={create}>
        <div className="space-y-2">
          <label htmlFor="team-count" className="block font-medium">組數</label>
          <input
            id="team-count" type="number" min={1} max={20} required value={teamCount}
            onChange={(event) => setTeamCount(event.target.value)}
            className="w-24 rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>
        <button type="submit" className={primaryButton} disabled={busy}>建立活動</button>
        <button type="button" className={secondaryButton} onClick={logout}>登出</button>
      </form>
      {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
      <h2 className="mt-8 text-xl font-semibold">活動清單</h2>
      {activities === null && !error && <p className="mt-2 text-slate-600">讀取中…</p>}
      {activities?.length === 0 && <p className="mt-2 text-slate-600">尚未建立活動。</p>}
      {activities && activities.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-200">
          {activities.map((activity) => (
            <li key={activity.sessionId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <span className="font-mono text-lg font-semibold">{activity.activityCode}</span>
                <span className="ml-3 text-slate-600">{activity.teamCount} 組・{PHASE_LABELS[activity.phase]}・{activity.imported ? '已匯入' : '未匯入'}</span>
              </span>
              <Link to={`/teacher/sessions/${activity.sessionId}`} className={secondaryButton}>管理</Link>
            </li>
          ))}
        </ul>
      )}
    </PlaceholderPage>
  );
}
