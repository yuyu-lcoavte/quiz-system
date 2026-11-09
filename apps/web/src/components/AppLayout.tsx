import { Link, Outlet } from 'react-router-dom';
import { RoleNavigation } from './RoleNavigation.js';

export function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Link to="/" className="text-lg font-bold tracking-tight text-slate-950">
            課堂搶答系統
          </Link>
          <RoleNavigation />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 text-sm text-slate-500 sm:px-6">
          共用系統入口 · 老師端與學生端功能依模組逐步提供
        </div>
      </footer>
    </div>
  );
}
