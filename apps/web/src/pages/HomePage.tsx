import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <section className="space-y-8" aria-labelledby="home-title">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Shared Foundation</p>
        <h1 id="home-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
          課堂搶答系統
        </h1>
        <p className="text-base leading-7 text-slate-600 sm:text-lg">
          請選擇老師或學生入口。各模組功能將由負責團隊後續提供。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RoleCard
          title="老師入口"
          description="前往老師登入與活動管理模組。這裡目前僅提供共用導覽入口。"
          to="/teacher/login"
          action="進入老師端"
        />
        <RoleCard
          title="學生入口"
          description="前往學生加入活動與作答模組。這裡目前僅提供共用導覽入口。"
          to="/student/join"
          action="進入學生端"
        />
      </div>
    </section>
  );
}

interface RoleCardProps {
  title: string;
  description: string;
  to: string;
  action: string;
}

function RoleCard({ title, description, to, action }: RoleCardProps) {
  return (
    <article className="flex flex-col items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="flex-1 leading-7 text-slate-600">{description}</p>
      <Link
        to={to}
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-indigo-700 px-5 py-2.5 font-semibold text-white hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
      >
        {action}
      </Link>
    </article>
  );
}
