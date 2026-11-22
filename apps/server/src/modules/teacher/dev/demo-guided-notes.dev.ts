/**
 * DEVELOPMENT ONLY — not used by the Guided Notes import flow.
 *
 * Demo questions for `npm run teacher:seed-demo`, so P1 can be tested by hand without Google Sheets.
 * Shaped like the question-group template in docs/examples/: numbers 1–4, where 1 and 2 are groups of two
 * questions (one blank each, markers （1）/（2）) and 3 and 4 are single questions with one unmarked blank.
 * Production code must never import this file (enforced by tests/unit/teacher-seed-demo.test.ts).
 */

export interface DemoTarget {
  readonly number: string;
  readonly kind: 'question' | 'questionGroup';
  /** One entry per question; each lists its blank labels (null = no marker). */
  readonly questions: readonly (readonly (string | null)[])[];
}

export const DEMO_TEAM_COUNT = 2;

export const DEMO_TARGETS: readonly DemoTarget[] = [
  { number: '1', kind: 'questionGroup', questions: [['（1）'], ['（2）']] },
  { number: '2', kind: 'questionGroup', questions: [['（1）'], ['（2）']] },
  { number: '3', kind: 'question', questions: [[null]] },
  { number: '4', kind: 'question', questions: [[null]] },
];
