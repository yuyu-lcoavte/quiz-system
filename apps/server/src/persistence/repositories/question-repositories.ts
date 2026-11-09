import type Database from 'better-sqlite3';
import type { Blank, Question, QuestionGroup, QuestionGroupView, QuestionView, UUID } from '@quiz/contracts/domain';
import { validateBlank, validateQuestion, validateQuestionGroup, validateSameSession } from '../../modules/sessions/domain/model-validation.js';
import { mapBlank, mapQuestion, mapQuestionGroup, type BlankRow, type QuestionGroupRow, type QuestionRow } from './row-mappers.js';

export class BlankRepository {
  constructor(private readonly database: Database.Database) {}

  create(value: Blank): Blank {
    validateBlank(value);
    const question = this.database.prepare('SELECT id FROM questions WHERE id = ?').get(value.questionId);
    if (!question) throw new Error('Blank must reference an existing Question.');
    this.database.prepare('INSERT INTO blanks (id, question_id, label, position) VALUES (?, ?, ?, ?)')
      .run(value.id, value.questionId, value.label ?? null, value.position);
    return value;
  }

  listByQuestion(questionId: UUID): Blank[] {
    const rows = this.database.prepare('SELECT * FROM blanks WHERE question_id = ? ORDER BY position, id').all(questionId) as BlankRow[];
    return rows.map(mapBlank);
  }
}

export class QuestionRepository {
  constructor(private readonly database: Database.Database, private readonly blanks: BlankRepository) {}

  create(value: Question): Question {
    validateQuestion(value);
    if (value.questionGroupId) {
      const group = this.database.prepare('SELECT session_id FROM question_groups WHERE id = ?').get(value.questionGroupId) as { session_id: string } | undefined;
      if (!group) throw new Error('QuestionGroup must exist before a Question can belong to it.');
      validateSameSession(value.sessionId, group.session_id, 'Question and QuestionGroup');
    }
    this.database.prepare(`INSERT INTO questions (id, session_id, question_group_id, display_number, prompt, position)
      VALUES (?, ?, ?, ?, ?, ?)`).run(value.id, value.sessionId, value.questionGroupId ?? null, value.displayNumber ?? null, value.prompt ?? null, value.position);
    return value;
  }

  findById(id: UUID): QuestionView | null {
    const row = this.database.prepare('SELECT * FROM questions WHERE id = ?').get(id) as QuestionRow | undefined;
    return row ? { ...mapQuestion(row), blanks: this.blanks.listByQuestion(id) } : null;
  }

  listByGroup(questionGroupId: UUID): QuestionView[] {
    const rows = this.database.prepare('SELECT * FROM questions WHERE question_group_id = ? ORDER BY position, id').all(questionGroupId) as QuestionRow[];
    return rows.map((row) => ({ ...mapQuestion(row), blanks: this.blanks.listByQuestion(row.id as UUID) }));
  }
}

export class QuestionGroupRepository {
  constructor(private readonly database: Database.Database, private readonly questions: QuestionRepository) {}

  create(value: QuestionGroup): QuestionGroup {
    validateQuestionGroup(value);
    this.database.prepare('INSERT INTO question_groups (id, session_id, label, position) VALUES (?, ?, ?, ?)')
      .run(value.id, value.sessionId, value.label ?? null, value.position);
    return value;
  }

  findById(id: UUID): QuestionGroupView | null {
    const row = this.database.prepare('SELECT * FROM question_groups WHERE id = ?').get(id) as QuestionGroupRow | undefined;
    return row ? { ...mapQuestionGroup(row), questions: this.questions.listByGroup(id) } : null;
  }
}
