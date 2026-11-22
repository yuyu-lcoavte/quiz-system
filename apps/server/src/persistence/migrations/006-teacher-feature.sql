-- Teacher Feature (specs/003-teacher-feature/data-model.md). Additive only; Foundation and Student tables are unchanged.

-- One row per teacher login (device). The raw session id lives only in the cookie; only its SHA-256 digest is stored.
CREATE TABLE teacher_login_sessions (
  id_digest TEXT PRIMARY KEY NOT NULL CHECK (length(id_digest) = 64),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

-- The Google Sheets tab a Session's questions were imported from.
CREATE TABLE teacher_sheet_sources (
  session_id TEXT PRIMARY KEY NOT NULL,
  spreadsheet_id TEXT NOT NULL,
  sheet_id INTEGER NOT NULL CHECK (typeof(sheet_id) = 'integer'),
  sheet_title TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE RESTRICT
);

-- Source cell of each imported Blank; several Blanks may share one cell (one marker each).
CREATE TABLE teacher_blank_cells (
  blank_id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  cell_a1 TEXT NOT NULL,
  original_content TEXT NOT NULL,
  marker TEXT,
  marker_index INTEGER NOT NULL CHECK (typeof(marker_index) = 'integer' AND marker_index >= 0),
  last_written_content TEXT,
  last_written_at TEXT,
  UNIQUE (session_id, cell_a1, marker_index),
  FOREIGN KEY (blank_id) REFERENCES blanks(id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id) REFERENCES teacher_sheet_sources(session_id) ON DELETE RESTRICT
);
