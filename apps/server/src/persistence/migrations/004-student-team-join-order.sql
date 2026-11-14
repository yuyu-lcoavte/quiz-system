CREATE TABLE student_team_join_order (
  participant_id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  join_order INTEGER NOT NULL CHECK (typeof(join_order) = 'integer' AND join_order > 0),
  UNIQUE (team_id, join_order),
  FOREIGN KEY (team_id, participant_id) REFERENCES participants(team_id, id) ON DELETE CASCADE
);

INSERT INTO student_team_join_order (participant_id, team_id, join_order)
SELECT id, team_id, ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY created_at, id)
FROM participants;
