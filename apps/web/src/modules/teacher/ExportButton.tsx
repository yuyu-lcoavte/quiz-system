import type { UUID } from '@quiz/contracts/domain';
import { secondaryButton } from './use-teacher-api.js';

/** Same-origin download: the browser sends the HttpOnly Teacher cookie; the server sets the file name (FR-037). */
export function ExportButton({ sessionId }: { readonly sessionId: UUID }) {
  return (
    <a href={`/api/v1/teacher/sessions/${sessionId}/export.csv`} download className={secondaryButton}>
      匯出 CSV
    </a>
  );
}
