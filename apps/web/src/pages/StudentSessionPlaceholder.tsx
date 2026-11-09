import { useParams } from 'react-router-dom';
import { PlaceholderPage } from './PlaceholderPage.js';

export function StudentSessionPlaceholder() {
  const { sessionId } = useParams<{ sessionId: string }>();

  return (
    <PlaceholderPage
      title="學生活動頁面"
      moduleName="學生端"
      description="這是學生進入活動後的頁面入口；等待、作答、提交與查看結果功能尚未實作。"
    >
      <dl className="mt-5 rounded-lg bg-slate-50 p-4">
        <dt className="text-sm font-medium text-slate-500">活動識別碼（Session ID）</dt>
        <dd className="mt-1 break-all font-mono text-sm text-slate-900">{sessionId}</dd>
      </dl>
    </PlaceholderPage>
  );
}
