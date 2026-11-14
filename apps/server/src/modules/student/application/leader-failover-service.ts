import type Database from 'better-sqlite3';
import type { StudentMembershipChangedPayload } from '@quiz/contracts';
import type { UUID } from '@quiz/contracts/domain';
import { createStudentRepositories, type TeamLeaderRecord } from '../persistence/index.js';

type TeamScope = StudentMembershipChangedPayload;

/** A Team is eligible for arrival-triggered recovery only after an observed disconnect. */
export class LeaderFailoverService {
  private readonly repositories;
  private readonly offline = new Map<UUID, TeamLeaderRecord>();

  constructor(private readonly database: Database.Database) {
    this.repositories = createStudentRepositories(database);
  }

  reconcile(scope: TeamScope, online: () => ReadonlySet<UUID>, disconnectedParticipant?: UUID): boolean {
    const { teamId } = scope;
    if (!disconnectedParticipant && !this.offline.has(teamId)) return false;
    const result = this.database.transaction(() => {
      const leader = this.repositories.teamLeaders.findByTeamId(teamId);
      if (!leader) return { changed: false, offline: null };
      const observed = this.offline.get(teamId);
      const wasObservedOffline = observed?.participantId === leader.participantId && observed.assignedAt === leader.assignedAt;
      if (!wasObservedOffline && disconnectedParticipant !== leader.participantId) {
        return { changed: false, offline: null };
      }

      const present = online();
      if (present.has(leader.participantId)) return { changed: false, offline: null };
      this.offline.set(teamId, leader);
      const successor = this.repositories.teamJoinOrder.listParticipants(teamId).find(id => present.has(id));
      if (!successor) return { changed: false, offline: leader };

      const changed = this.repositories.teamLeaders.replaceIfCurrent(teamId, leader.participantId, {
        participantId: successor,
        assignedAt: new Date().toISOString(),
        assignedByKind: 'system',
        assignedById: null,
      });
      return { changed, offline: changed ? null : leader };
    }).immediate();
    if (result.offline) this.offline.set(teamId, result.offline);
    else this.offline.delete(teamId);
    return result.changed;
  }
}
