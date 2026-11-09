import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
      <p className="text-sm font-semibold text-indigo-700">404</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">找不到此頁面</h1>
      <p className="mt-3 leading-7 text-slate-600">這個網址沒有對應的頁面，請確認路徑或返回首頁。</p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-indigo-700 px-5 py-2.5 font-semibold text-white hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
      >
        返回首頁
      </Link>
    </section>
  );
}
