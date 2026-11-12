import { describe, expect, it } from 'vitest';
import { createStudentRepositories } from '../../apps/server/src/modules/student/persistence/index.js';
import { createFoundationTestContext, ids, participant, session, team, TIME } from '../helpers/foundation.js';
import type { UUID } from '@quiz/contracts/domain';

const credentialId = '00000000-0000-4000-8000-000000000201' as UUID;
const participant2Id = '00000000-0000-4000-8000-000000000202' as UUID;
const participant3Id = '00000000-0000-4000-8000-000000000203' as UUID;

function seedStudentFixture() {
  const context = createFoundationTestContext();
  const db = context.database;
  context.repositories.sessions.create({
    id: ids.session1,
    activityCode: 'STUDENT-REPO',
    currentRoundId: null,
    stateVersion: 0,
    createdAt: TIME,
  });
  context.repositories.teams.create({ id: ids.team1, sessionId: ids.session1, name: 'Team A', createdAt: TIME });
  context.repositories.questions.create({ id: ids.question1, sessionId: ids.session1, questionGroupId: null, displayNumber: '1', prompt: 'Prompt', position: 0 });
  context.repositories.blanks.create({ id: ids.blank1, questionId: ids.question1, label: '(1)', position: 0 });
  context.repositories.rounds.create({ id: ids.round1, sessionId: ids.session1, questionId: ids.question1, questionGroupId: null, phase: 'Active', createdAt: TIME, startedAt: TIME, endedAt: null });
  context.repositories.participants.create({ id: ids.participant1, teamId: ids.team1, displayName: 'Learner', createdAt: TIME });
  return { ...context, db, student: createStudentRepositories(db) };
}

describe('Student persistence repositories', () => {
  it('stores credential digests and resolves a canonical Participant within one Session', () => {
    const { student } = seedStudentFixture();
    student.credentials.create({ id: credentialId, tokenHash: 'b'.repeat(64), createdAt: TIME, expiresAt: '2026-11-11T01:00:00.000Z', revokedAt: null, lastSeenAt: TIME });
    student.browserParticipants.create({ credentialId, sessionId: ids.session1, participantId: ids.participant1, createdAt: TIME });

    expect(student.credentials.findByTokenHash('b'.repeat(64))).toMatchObject({ id: credentialId, tokenHash: 'b'.repeat(64), revokedAt: null });
    expect(student.browserParticipants.findForSession(credentialId, ids.session1)).toMatchObject({ participantId: ids.participant1, teamId: ids.team1, sessionId: ids.session1 });
    expect(student.browserParticipants.findForSession(credentialId, ids.session2)).toBeNull();
  });

  it('creates a Team leader at most once without replacing an existing leader', () => {
    const { student, repositories } = seedStudentFixture();
    repositories.participants.create({ id: participant2Id, teamId: ids.team1, displayName: 'Second learner', createdAt: TIME });

    expect(student.teamLeaders.createIfAbsent({ teamId: ids.team1, participantId: ids.participant1, assignedAt: TIME, assignedByKind: 'system', assignedById: null })).toBe(true);
    expect(student.teamLeaders.createIfAbsent({ teamId: ids.team1, participantId: participant2Id, assignedAt: TIME, assignedByKind: 'system', assignedById: null })).toBe(false);
    expect(student.teamLeaders.findByTeamId(ids.team1)?.participantId).toBe(ids.participant1);
  });

  it('updates one leader row and rejects a competing assignment based on the former leader', () => {
    const { student, db, repositories } = seedStudentFixture();
    repositories.participants.create(participant(participant2Id));
    repositories.participants.create(participant(participant3Id));
    const original = { participantId: ids.participant1, assignedAt: TIME, assignedByKind: 'participant', assignedById: ids.participant1 } as const;
    student.teamLeaders.createIfAbsent({ ...original, teamId: ids.team1 });

    const replace = db.transaction((successorId: UUID) =>
      student.teamLeaders.replaceIfCurrent(ids.team1, original.participantId, { ...original, participantId: successorId }),
    );
    expect(replace.immediate(participant2Id)).toBe(true);
    expect(replace.immediate(participant3Id)).toBe(false);
    expect(student.teamLeaders.findByTeamId(ids.team1)?.participantId).toBe(participant2Id);
    expect(db.prepare('SELECT count(*) AS count FROM team_leaders WHERE team_id = ?').get(ids.team1)).toEqual({ count: 1 });
  });

  it('rejects replacement by a Participant outside the Team, including another Session', () => {
    const { student, db, repositories } = seedStudentFixture();
    repositories.sessions.create(session(ids.session2));
    repositories.teams.create(team(ids.team2));
    repositories.teams.create(team(ids.teamOtherSession, ids.session2));
    repositories.participants.create(participant(participant2Id, ids.team2));
    repositories.participants.create(participant(participant3Id, ids.teamOtherSession));
    const original = { participantId: ids.participant1, assignedAt: TIME, assignedByKind: 'system', assignedById: null } as const;
    student.teamLeaders.createIfAbsent({ ...original, teamId: ids.team1 });

    const replace = db.transaction((successorId: UUID) =>
      student.teamLeaders.replaceIfCurrent(ids.team1, original.participantId, { ...original, participantId: successorId }),
    );
    for (const successorId of [participant2Id, participant3Id]) {
      expect(() => replace.immediate(successorId)).toThrow(expect.objectContaining({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }));
      expect(student.teamLeaders.findByTeamId(ids.team1)).toEqual({ ...original, teamId: ids.team1 });
    }
  });

  it('provides transaction-bound draft create, version, answer, snapshot and lock operations', () => {
    const { student, db } = seedStudentFixture();
    const createDraft = db.transaction(() => {
      return student.drafts.createIfAbsent({ sessionId: ids.session1, teamId: ids.team1, roundId: ids.round1, version: 0, status: 'editable', createdAt: TIME, updatedAt: TIME, lockedAt: null });
    });
    expect(createDraft.immediate()).toBe(true);
    expect(student.drafts.createIfAbsent({ sessionId: ids.session1, teamId: ids.team1, roundId: ids.round1, version: 0, status: 'editable', createdAt: TIME, updatedAt: TIME, lockedAt: null })).toBe(false);

    const edit = db.transaction(() => {
      const version = student.drafts.incrementVersion(ids.team1, ids.round1, TIME);
      expect(version).toBe(1);
      if (version === null) throw new Error('Draft was not created.');
      student.draftAnswers.upsert({ teamId: ids.team1, roundId: ids.round1, blankId: ids.blank1, value: 'draft', revision: version, updatedByParticipantId: ids.participant1, updatedAt: TIME });
    });
    edit.immediate();
    expect(student.drafts.find(ids.team1, ids.round1)?.version).toBe(1);
    expect(student.draftAnswers.list(ids.team1, ids.round1)).toMatchObject([{ blankId: ids.blank1, value: 'draft', revision: 1 }]);

    const lock = db.transaction(() => student.drafts.lock(ids.team1, ids.round1, TIME));
    expect(lock.immediate()).toBe(true);
    expect(student.drafts.find(ids.team1, ids.round1)?.status).toBe('locked');
    expect(() => student.draftAnswers.upsert({ teamId: ids.team1, roundId: ids.round1, blankId: ids.blank1, value: 'late', revision: 2, updatedByParticipantId: ids.participant1, updatedAt: TIME })).toThrow();
  });
});
