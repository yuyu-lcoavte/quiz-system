import { NavLink } from 'react-router-dom';

const navigationItems = [
  { to: '/', label: '首頁', end: true },
  { to: '/teacher/login', label: '老師入口' },
  { to: '/student/join', label: '學生入口' },
];

export function RoleNavigation() {
  return (
    <nav aria-label="主要導覽" className="flex flex-wrap items-center gap-2 sm:gap-3">
      {navigationItems.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? 'bg-indigo-50 text-indigo-800'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
