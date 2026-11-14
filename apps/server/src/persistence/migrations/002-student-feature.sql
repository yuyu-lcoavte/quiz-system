-- Student-only persistence. Foundation Session/Team/Participant/Submission/Result rows stay authoritative.

CREATE UNIQUE INDEX participants_team_id_id_unique ON participants (team_id, id);

CREATE TABLE student_browser_credentials (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT NOT NULL,
  CHECK (expires_at > created_at)
);

CREATE TABLE student_browser_participants (
  credential_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (credential_id, session_id),
  UNIQUE (session_id, participant_id),
  FOREIGN KEY (credential_id) REFERENCES student_browser_credentials(id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE RESTRICT,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE RESTRICT
);

CREATE INDEX student_browser_participants_session_participant_idx
  ON student_browser_participants (session_id, participant_id);

CREATE TRIGGER student_browser_participants_same_session_insert
BEFORE INSERT ON student_browser_participants
WHEN NOT EXISTS (
  SELECT 1
  FROM participants p
  JOIN teams t ON t.id = p.team_id
  WHERE p.id = NEW.participant_id AND t.session_id = NEW.session_id
)
BEGIN
  SELECT RAISE(ABORT, 'student Participant must belong to the mapped Session');
END;

CREATE TRIGGER student_browser_participants_same_session_update
BEFORE UPDATE OF session_id, participant_id ON student_browser_participants
WHEN NOT EXISTS (
  SELECT 1
  FROM participants p
  JOIN teams t ON t.id = p.team_id
  WHERE p.id = NEW.participant_id AND t.session_id = NEW.session_id
)
BEGIN
  SELECT RAISE(ABORT, 'student Participant must belong to the mapped Session');
END;

CREATE TRIGGER student_participant_team_change_preserves_session_mapping
BEFORE UPDATE OF team_id ON participants
WHEN EXISTS (
  SELECT 1
  FROM student_browser_participants sbp
  JOIN teams old_team ON old_team.id = OLD.team_id
  JOIN teams new_team ON new_team.id = NEW.team_id
  WHERE sbp.participant_id = OLD.id AND old_team.session_id <> new_team.session_id
)
BEGIN
  SELECT RAISE(ABORT, 'a Student Participant cannot move across Sessions');
END;

CREATE TABLE team_leaders (
  team_id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL UNIQUE,
  assigned_at TEXT NOT NULL,
  assigned_by_kind TEXT NOT NULL CHECK (assigned_by_kind IN ('participant', 'teacher', 'system')),
  assigned_by_id TEXT,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT,
  FOREIGN KEY (team_id, participant_id) REFERENCES participants(team_id, id) ON DELETE RESTRICT
);

CREATE TABLE team_round_drafts (
  session_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK (typeof(version) = 'integer' AND version >= 0),
  status TEXT NOT NULL DEFAULT 'editable' CHECK (status IN ('editable', 'locked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  locked_at TEXT,
  PRIMARY KEY (team_id, round_id),
  UNIQUE (session_id, team_id, round_id),
  CHECK ((status = 'editable' AND locked_at IS NULL) OR (status = 'locked' AND locked_at IS NOT NULL)),
  FOREIGN KEY (session_id, team_id) REFERENCES teams(session_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id, round_id) REFERENCES rounds(session_id, id) ON DELETE RESTRICT
);

CREATE INDEX team_round_drafts_session_round_idx ON team_round_drafts (session_id, round_id);

CREATE TRIGGER team_round_drafts_cannot_unlock
BEFORE UPDATE OF status ON team_round_drafts
WHEN OLD.status = 'locked' AND NEW.status <> 'locked'
BEGIN
  SELECT RAISE(ABORT, 'a locked Team/Round draft cannot be unlocked');
END;

CREATE TABLE team_round_draft_answers (
  team_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  blank_id TEXT NOT NULL,
  value TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (typeof(revision) = 'integer' AND revision > 0),
  updated_by_participant_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (team_id, round_id, blank_id),
  FOREIGN KEY (team_id, round_id) REFERENCES team_round_drafts(team_id, round_id) ON DELETE RESTRICT,
  FOREIGN KEY (blank_id) REFERENCES blanks(id) ON DELETE RESTRICT,
  FOREIGN KEY (team_id, updated_by_participant_id) REFERENCES participants(team_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER team_round_draft_answers_target_insert
BEFORE INSERT ON team_round_draft_answers
WHEN NOT EXISTS (
  SELECT 1
  FROM team_round_drafts d
  JOIN rounds r ON r.id = d.round_id AND r.session_id = d.session_id
  JOIN blanks b ON b.id = NEW.blank_id
  JOIN questions q ON q.id = b.question_id
  WHERE d.team_id = NEW.team_id
    AND d.round_id = NEW.round_id
    AND (
      (r.question_id IS NOT NULL AND q.id = r.question_id)
      OR (r.question_group_id IS NOT NULL AND q.question_group_id = r.question_group_id AND q.session_id = r.session_id)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'draft answer Blank must belong to the Round target');
END;

CREATE TRIGGER team_round_draft_answers_target_update
BEFORE UPDATE OF team_id, round_id, blank_id, updated_by_participant_id ON team_round_draft_answers
WHEN NOT EXISTS (
  SELECT 1
  FROM team_round_drafts d
  JOIN rounds r ON r.id = d.round_id AND r.session_id = d.session_id
  JOIN blanks b ON b.id = NEW.blank_id
  JOIN questions q ON q.id = b.question_id
  WHERE d.team_id = NEW.team_id
    AND d.round_id = NEW.round_id
    AND (
      (r.question_id IS NOT NULL AND q.id = r.question_id)
      OR (r.question_group_id IS NOT NULL AND q.question_group_id = r.question_group_id AND q.session_id = r.session_id)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'draft answer Blank must belong to the Round target');
END;

CREATE TRIGGER team_round_draft_answers_insert_unlocked
BEFORE INSERT ON team_round_draft_answers
WHEN EXISTS (
  SELECT 1 FROM team_round_drafts d
  WHERE d.team_id = NEW.team_id AND d.round_id = NEW.round_id AND d.status = 'locked'
)
BEGIN
  SELECT RAISE(ABORT, 'a locked Team/Round draft cannot be changed');
END;

CREATE TRIGGER team_round_draft_answers_update_unlocked
BEFORE UPDATE ON team_round_draft_answers
WHEN EXISTS (
  SELECT 1 FROM team_round_drafts d
  WHERE d.team_id = OLD.team_id AND d.round_id = OLD.round_id AND d.status = 'locked'
)
BEGIN
  SELECT RAISE(ABORT, 'a locked Team/Round draft cannot be changed');
END;

CREATE TRIGGER team_round_draft_answers_delete_unlocked
BEFORE DELETE ON team_round_draft_answers
WHEN EXISTS (
  SELECT 1 FROM team_round_drafts d
  WHERE d.team_id = OLD.team_id AND d.round_id = OLD.round_id AND d.status = 'locked'
)
BEGIN
  SELECT RAISE(ABORT, 'a locked Team/Round draft cannot be changed');
END;
