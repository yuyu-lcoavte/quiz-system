import { describe, expect, it } from 'vitest';
import { studentDraftRoomName, studentDraftRoomScope } from '../../apps/server/src/modules/student/realtime/student-draft-room.js';
import { ids } from '../helpers/foundation.js';

describe('Student Team/Round room derivation', () => {
  it('derives a room only from a verified Participant ActorContext', () => {
    const actor = { actorKind: 'participant' as const, actorId: ids.participant1, sessionId: ids.session1, teamId: ids.team1, permissions: [] };
    expect(studentDraftRoomName(actor, ids.round1)).toBe(`student:team:${ids.team1}:round:${ids.round1}`);
    expect(studentDraftRoomScope(actor, ids.round1)).toEqual({ sessionId: ids.session1, teamId: ids.team1, roundId: ids.round1 });
  });

  it('cannot derive a room from a Teacher, missing Team, or malformed Round', () => {
    expect(studentDraftRoomName({ actorKind: 'teacher', actorId: 'teacher', sessionId: ids.session1, permissions: [] }, ids.round1)).toBeNull();
    expect(studentDraftRoomName({ actorKind: 'participant', actorId: ids.participant1, sessionId: ids.session1, permissions: [] }, ids.round1)).toBeNull();
    expect(studentDraftRoomName({ actorKind: 'participant', actorId: ids.participant1, sessionId: ids.session1, teamId: ids.team1, permissions: [] }, 'not-a-uuid')).toBeNull();
  });
});
