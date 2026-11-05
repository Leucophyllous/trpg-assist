CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  system TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  invite_token TEXT NOT NULL,
  creator_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_invite ON tables(invite_token);
CREATE INDEX IF NOT EXISTS idx_tables_creator ON tables(creator_hash, created_at);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_token ON members(token_hash);
CREATE INDEX IF NOT EXISTS idx_members_table ON members(table_id);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rules_table ON rules(table_id, updated_at);

CREATE TABLE IF NOT EXISTS sheets (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  author_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sheets_table ON sheets(table_id, updated_at);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  played_on TEXT NOT NULL,
  author_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_table ON logs(table_id, updated_at);

CREATE TABLE IF NOT EXISTS dice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  member_name TEXT NOT NULL,
  system TEXT NOT NULL,
  command TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dice_table ON dice(table_id, id);
