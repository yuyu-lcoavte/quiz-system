import { Link } from 'react-router-dom';

interface PlaceholderPageProps {
  title: string;
  moduleName: '老師端' | '學生端';
  description: string;
  children?: React.ReactNode;
}

export function PlaceholderPage({ title, moduleName, description, children }: PlaceholderPageProps) {
  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold text-indigo-700">目前模組：{moduleName}</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-4 leading-7 text-slate-600">{description}</p>
      {children}
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
      >
        返回首頁
      </Link>
    </section>
  );
}
