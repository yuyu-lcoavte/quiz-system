import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { UUID } from '@quiz/contracts/domain';
import { ExportButton } from '../../apps/web/src/modules/teacher/ExportButton.js';
import { ids } from '../helpers/foundation.js';

describe('ExportButton', () => {
  it('links to the Teacher CSV export of this activity as a download', () => {
    render(<ExportButton sessionId={ids.session1 as UUID} />);
    const link = screen.getByRole('link', { name: '匯出 CSV' });
    expect(link.getAttribute('href')).toBe(`/api/v1/teacher/sessions/${ids.session1}/export.csv`);
    expect(link.hasAttribute('download')).toBe(true);
  });
});
