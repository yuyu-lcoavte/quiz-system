import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { UUID } from '@quiz/contracts/domain';
import type { ImportPreviewView } from '@quiz/contracts';
import { HttpError } from '../../../errors/http-error.js';
import { createFoundationRepositories } from '../../../persistence/repositories/index.js';
import type { TeacherRepositories } from '../persistence/index.js';
import { requireGateway, type SheetsGateway } from '../sheets/sheets-gateway.js';
import { parseGuidedNotes, type ParsedTarget } from './parser.js';
import { parseSheetUrl } from './sheet-url.js';

interface Parsed {
  readonly view: ImportPreviewView;
  readonly targets: ParsedTarget[];
}

/**
 * Preview reads and parses the live sheet and saves nothing; confirm re-reads, requires the same digest,
 * then replaces the Session's questions in one transaction while no Round exists (FR-029–FR-032).
 */
export class GuidedNotesImportService {
  private readonly hasRound;

  constructor(
    private readonly database: Database.Database,
    private readonly teacher: TeacherRepositories,
    private readonly gateway: SheetsGateway | null,
    private readonly now: () => Date,
  ) {
    this.hasRound = database.prepare('SELECT 1 FROM rounds WHERE session_id = ? LIMIT 1');
  }

  async preview(url: string): Promise<ImportPreviewView> {
    return (await this.read(url)).view;
  }

  async confirm(sessionId: UUID, url: string, previewDigest: string): Promise<void> {
    this.assertUnlocked(sessionId);
    const parsed = await this.read(url);
    if (parsed.view.previewDigest !== previewDigest) {
      throw new HttpError(409, 'PREVIEW_CHANGED', 'The spreadsheet changed after the preview.');
    }
    const repositories = createFoundationRepositories(this.database);
    this.database.transaction(() => {
      this.assertUnlocked(sessionId);
      this.deleteImported(sessionId);
      this.teacher.sheetSources.replace({
        sessionId,
        spreadsheetId: parsed.view.spreadsheetId,
        sheetId: parsed.view.sheetId,
        sheetTitle: parsed.view.sheetTitle,
        importedAt: this.now().toISOString(),
      });
      parsed.targets.forEach((target, position) => {
        const groupId = target.kind === 'questionGroup' ? randomUUID() as UUID : null;
        if (groupId) repositories.questionGroups.create({ id: groupId, sessionId, label: target.number, position });
        target.questions.forEach((question, row) => {
          const questionId = randomUUID() as UUID;
          repositories.questions.create({
            id: questionId, sessionId, questionGroupId: groupId, displayNumber: target.number, prompt: null,
            position: groupId ? row : position,
          });
          question.blanks.forEach((blank, index) => {
            const blankId = randomUUID() as UUID;
            repositories.blanks.create({ id: blankId, questionId, label: blank.marker, position: index });
            this.teacher.blankCells.create({
              blankId, sessionId, cellA1: blank.cellA1, originalContent: blank.originalContent,
              marker: blank.marker, markerIndex: blank.markerIndex,
            });
          });
        });
      });
    }).immediate();
  }

  private async read(url: string): Promise<Parsed> {
    const ref = parseSheetUrl(url);
    const tab = await requireGateway(this.gateway).readSheet(ref);
    const result = parseGuidedNotes({ sheetTitle: tab.sheetTitle, values: tab.values, merges: tab.merges });
    if (!result.ok) {
      throw new HttpError(422, result.error.code, result.error.message, result.error.cellA1 ? { cellA1: result.error.cellA1 } : undefined);
    }
    const targets = result.targets.map((target) => ({
      number: target.number,
      kind: target.kind,
      questions: target.questions.map((question) => ({
        row: question.rowA1,
        blanks: question.blanks.map((blank) => ({ cellA1: blank.cellA1, marker: blank.marker, originalContent: blank.originalContent })),
      })),
    }));
    const digestSource = JSON.stringify({ spreadsheetId: ref.spreadsheetId, sheetId: tab.sheetId, sheetTitle: tab.sheetTitle, targets: result.targets });
    return {
      targets: result.targets,
      view: {
        spreadsheetId: ref.spreadsheetId,
        sheetId: tab.sheetId,
        sheetTitle: tab.sheetTitle,
        questionNumberCount: result.targets.length,
        targets,
        warnings: result.warnings.map((warning) => (warning.cellA1 ? `${warning.cellA1}: ${warning.message}` : warning.message)),
        previewDigest: createHash('sha256').update(digestSource).digest('hex'),
      },
    };
  }

  private assertUnlocked(sessionId: UUID): void {
    if (this.hasRound.get(sessionId)) throw new HttpError(409, 'IMPORT_LOCKED', 'Questions cannot be replaced after the first Round.');
  }

  /** Only while the Session has no Round; Foundation triggers still reject deleting anything a Round uses. */
  private deleteImported(sessionId: UUID): void {
    this.teacher.blankCells.deleteBySession(sessionId);
    this.database.prepare('DELETE FROM blanks WHERE question_id IN (SELECT id FROM questions WHERE session_id = ?)').run(sessionId);
    this.database.prepare('DELETE FROM questions WHERE session_id = ?').run(sessionId);
    this.database.prepare('DELETE FROM question_groups WHERE session_id = ?').run(sessionId);
  }
}
