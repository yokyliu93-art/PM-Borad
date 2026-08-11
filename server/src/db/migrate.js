import db from './connection.js';

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar_url TEXT,
      department TEXT,
      email TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL REFERENCES teams(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'member',
      PRIMARY KEY (team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id),
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      plan_markdown TEXT DEFAULT '',
      pm_user_id TEXT NOT NULL REFERENCES users(id),
      timeline_json TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      cycle TEXT DEFAULT '',
      doc_url TEXT DEFAULT '',
      owner_id TEXT REFERENCES users(id),
      progress INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      sort_order INTEGER DEFAULT 0,
      is_published INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      title TEXT NOT NULL,
      assignee_id TEXT REFERENCES users(id),
      status TEXT DEFAULT 'pending',
      note TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS progress_updates (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS template_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      tasks_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_attachments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      mime TEXT DEFAULT '',
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subtask_attachments (
      id TEXT PRIMARY KEY,
      subtask_id TEXT NOT NULL REFERENCES subtasks(id),
      task_id TEXT NOT NULL REFERENCES tasks(id),
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      mime TEXT DEFAULT '',
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, user_id)
    );
  `);

  // Add submission fields to subtasks. CREATE TABLE IF NOT EXISTS won't add
  // columns to an existing table, so guard each ALTER by checking the schema.
  const subCols = db.prepare('PRAGMA table_info(subtasks)').all().map((c) => c.name);
  if (!subCols.includes('submission_description')) {
    db.exec("ALTER TABLE subtasks ADD COLUMN submission_description TEXT DEFAULT ''");
  }
  if (!subCols.includes('submitted_by')) {
    db.exec('ALTER TABLE subtasks ADD COLUMN submitted_by TEXT');
  }
  if (!subCols.includes('submitted_at')) {
    db.exec('ALTER TABLE subtasks ADD COLUMN submitted_at TEXT');
  }

  // Normalize task/subtask statuses to the Chinese values used by the UI
  // (older rows may hold English values written by the claim/unclaim flow).
  db.exec(`
    UPDATE tasks SET status = '待开始' WHERE status = 'pending';
    UPDATE tasks SET status = '进行中' WHERE status = 'in_progress';
    UPDATE tasks SET status = '已完成' WHERE status = 'completed';
    UPDATE subtasks SET status = '待开始' WHERE status = 'pending';
    UPDATE subtasks SET status = '进行中' WHERE status = 'in_progress';
    UPDATE subtasks SET status = '已完成' WHERE status = 'completed';
  `);

  console.log('[db] Migration complete');
}
