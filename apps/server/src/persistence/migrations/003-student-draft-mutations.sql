CREATE TABLE student_draft_mutations (
 team_id TEXT NOT NULL,
 round_id TEXT NOT NULL,
 client_mutation_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 change_json TEXT NOT NULL,
 PRIMARY KEY(team_id,round_id,client_mutation_id),
 FOREIGN KEY(team_id,round_id) REFERENCES team_round_drafts(team_id,round_id) ON DELETE RESTRICT
);
