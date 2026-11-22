import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { displayError } from '../../modules/teacher/teacher-api-client.js';
import { primaryButton, useTeacherApi } from '../../modules/teacher/use-teacher-api.js';
import { PlaceholderPage } from '../PlaceholderPage.js';

export function TeacherLoginPage() {
  const api = useTeacherApi();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      setPassword('');
      navigate('/teacher/dashboard');
    } catch (caught) {
      setError(displayError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PlaceholderPage title="老師登入入口" moduleName="老師端" description="請輸入老師密碼登入管理頁面。">
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <label htmlFor="teacher-password" className="block font-medium">密碼</label>
          <input
            id="teacher-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <button type="submit" className={primaryButton} disabled={busy || password.length === 0}>登入</button>
      </form>
    </PlaceholderPage>
  );
}
