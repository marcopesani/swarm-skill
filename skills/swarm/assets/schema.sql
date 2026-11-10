-- The swarm's shared database: the only channel between the lead and its workers.
-- Safe to run again after an import: every table is created only when missing.
-- Workers may add tables; they announce them in notes.

CREATE TABLE IF NOT EXISTS announce (   -- orders from the lead to the whole team
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  author TEXT NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assign (     -- who works on what; spawn writes one row per worker start
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  agent_id TEXT NOT NULL,
  task TEXT NOT NULL,
  skills TEXT NOT NULL DEFAULT '',      -- comma-separated skills the lead injected
  worktree TEXT
);

CREATE TABLE IF NOT EXISTS notes (      -- open board: plans, progress, questions (tag the lead with @lead)
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  author TEXT NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subtasks (   -- to-do list; the first worker to claim a task owns it
  id INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES subtasks(id),
  title TEXT NOT NULL,
  detail TEXT,
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'open',  -- open | claimed | done | blocked | needs-live (only the running app can prove it; the lead checks)
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS landed (     -- finished work, for the lead to check and merge
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  agent_id TEXT NOT NULL,
  task_id INTEGER REFERENCES subtasks(id),
  branch TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  tests TEXT NOT NULL                   -- the test command and its result
);
