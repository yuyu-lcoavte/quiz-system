CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  activity_code TEXT NOT NULL UNIQUE,
  current_round_id TEXT,
  state_version INTEGER NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (id, current_round_id) REFERENCES rounds(session_id, id)
);

CREATE TABLE question_groups (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  label TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (session_id, id),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE RESTRICT
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_group_id TEXT,
  display_number TEXT,
  prompt TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (session_id, id),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id, question_group_id) REFERENCES question_groups(session_id, id) ON DELETE RESTRICT
);

CREATE TABLE blanks (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  label TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (question_id, id),
  UNIQUE (question_id, position),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (session_id, id),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE RESTRICT
);

CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_id TEXT,
  question_group_id TEXT,
  phase TEXT NOT NULL CHECK (phase IN ('Waiting', 'Active', 'Ended')),
  created_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  UNIQUE (session_id, id),
  CHECK ((question_id IS NOT NULL AND question_group_id IS NULL)
      OR (question_id IS NULL AND question_group_id IS NOT NULL)),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id, question_id) REFERENCES questions(session_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id, question_group_id) REFERENCES question_groups(session_id, id) ON DELETE RESTRICT
);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT
);

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  accepted_order INTEGER NOT NULL CHECK (typeof(accepted_order) = 'integer'),
  UNIQUE (team_id, round_id),
  UNIQUE (round_id, id),
  UNIQUE (round_id, accepted_order),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT,
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE RESTRICT
);

CREATE TABLE submission_answers (
  submission_id TEXT NOT NULL,
  blank_id TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (submission_id, blank_id),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE RESTRICT,
  FOREIGN KEY (blank_id) REFERENCES blanks(id) ON DELETE RESTRICT
);

CREATE TABLE results (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL UNIQUE,
  winning_submission_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (round_id, winning_submission_id) REFERENCES submissions(round_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER rounds_group_target_nonempty_insert
BEFORE INSERT ON rounds
WHEN NEW.question_group_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM questions WHERE question_group_id = NEW.question_group_id)
BEGIN
  SELECT RAISE(ABORT, 'empty question group cannot be a round target');
END;

CREATE TRIGGER rounds_group_target_nonempty_update
BEFORE UPDATE OF question_group_id, session_id ON rounds
WHEN NEW.question_group_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM questions
   WHERE question_group_id = NEW.question_group_id AND session_id = NEW.session_id
 )
BEGIN
  SELECT RAISE(ABORT, 'empty question group cannot be a round target');
END;

CREATE TRIGGER questions_prevent_empty_target_group_delete
BEFORE DELETE ON questions
WHEN OLD.question_group_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM rounds WHERE question_group_id = OLD.question_group_id)
 AND NOT EXISTS (
   SELECT 1 FROM questions WHERE question_group_id = OLD.question_group_id AND id <> OLD.id
 )
BEGIN
  SELECT RAISE(ABORT, 'cannot empty a question group used by a round');
END;

CREATE TRIGGER questions_prevent_empty_target_group_update
BEFORE UPDATE OF question_group_id, session_id ON questions
WHEN OLD.question_group_id IS NOT NULL
 AND OLD.question_group_id IS NOT NEW.question_group_id
 AND EXISTS (SELECT 1 FROM rounds WHERE question_group_id = OLD.question_group_id)
 AND NOT EXISTS (
   SELECT 1 FROM questions WHERE question_group_id = OLD.question_group_id AND id <> OLD.id
 )
BEGIN
  SELECT RAISE(ABORT, 'cannot empty a question group used by a round');
END;

CREATE TRIGGER submissions_same_session_insert
BEFORE INSERT ON submissions
WHEN NOT EXISTS (
  SELECT 1 FROM teams t JOIN rounds r ON r.session_id = t.session_id
  WHERE t.id = NEW.team_id AND r.id = NEW.round_id
)
BEGIN
  SELECT RAISE(ABORT, 'submission team and round must belong to the same session');
END;

CREATE TRIGGER submissions_same_session_update
BEFORE UPDATE OF team_id, round_id ON submissions
WHEN NOT EXISTS (
  SELECT 1 FROM teams t JOIN rounds r ON r.session_id = t.session_id
  WHERE t.id = NEW.team_id AND r.id = NEW.round_id
)
BEGIN
  SELECT RAISE(ABORT, 'submission team and round must belong to the same session');
END;

CREATE TRIGGER submission_answers_target_blank_insert
BEFORE INSERT ON submission_answers
WHEN NOT EXISTS (
  SELECT 1
  FROM submissions s
  JOIN rounds r ON r.id = s.round_id
  JOIN blanks b ON b.id = NEW.blank_id
  JOIN questions q ON q.id = b.question_id
  WHERE s.id = NEW.submission_id
    AND (
      (r.question_id IS NOT NULL AND q.id = r.question_id)
      OR
      (r.question_group_id IS NOT NULL AND q.question_group_id = r.question_group_id AND q.session_id = r.session_id)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'submission answer blank must belong to the round target');
END;

CREATE TRIGGER submission_answers_target_blank_update
BEFORE UPDATE OF submission_id, blank_id ON submission_answers
WHEN NOT EXISTS (
  SELECT 1
  FROM submissions s
  JOIN rounds r ON r.id = s.round_id
  JOIN blanks b ON b.id = NEW.blank_id
  JOIN questions q ON q.id = b.question_id
  WHERE s.id = NEW.submission_id
    AND (
      (r.question_id IS NOT NULL AND q.id = r.question_id)
      OR
      (r.question_group_id IS NOT NULL AND q.question_group_id = r.question_group_id AND q.session_id = r.session_id)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'submission answer blank must belong to the round target');
END;
