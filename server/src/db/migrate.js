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
      module_key TEXT DEFAULT 'main',
      module_name TEXT DEFAULT '主模块',
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

    CREATE TABLE IF NOT EXISTS project_modules (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      module_key TEXT NOT NULL,
      module_name TEXT NOT NULL,
      detail TEXT DEFAULT '',
      owner_id TEXT REFERENCES users(id),
      owner_assigned_by TEXT REFERENCES users(id),
      owner_assigned_at TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, module_key)
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

    CREATE TABLE IF NOT EXISTS user_feishu_tokens (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      access_token TEXT NOT NULL,
      refresh_token TEXT DEFAULT '',
      token_expires_at INTEGER,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_agent_keys (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      api_key_hash TEXT NOT NULL,
      api_key_prefix TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_agent_connections (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      client_name TEXT DEFAULT '',
      agent_name TEXT DEFAULT '',
      status TEXT DEFAULT 'disconnected',
      message TEXT DEFAULT '',
      last_seen_at TEXT,
      payload_json TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feishu_docs (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      doc_token TEXT NOT NULL,
      doc_type TEXT DEFAULT 'docx',
      title TEXT DEFAULT '',
      url TEXT DEFAULT '',
      content_markdown TEXT DEFAULT '',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subtask_steps (
      id TEXT PRIMARY KEY,
      subtask_id TEXT NOT NULL REFERENCES subtasks(id),
      task_id TEXT NOT NULL REFERENCES tasks(id),
      title TEXT NOT NULL,
      status TEXT DEFAULT '待开始',
      due_text TEXT DEFAULT '',
      delivery_doc_url TEXT DEFAULT '',
      reminder_frequency TEXT DEFAULT 'none',
      reminder_enabled INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subtask_schedule_items (
      id TEXT PRIMARY KEY,
      subtask_id TEXT NOT NULL REFERENCES subtasks(id),
      task_id TEXT NOT NULL REFERENCES tasks(id),
      week_index INTEGER NOT NULL DEFAULT 1,
      goal TEXT DEFAULT '',
      reminder_day INTEGER DEFAULT 1,
      reminder_time TEXT DEFAULT '10:00',
      delivery_doc_url TEXT DEFAULT '',
      status TEXT DEFAULT '未开始',
      reminder_enabled INTEGER DEFAULT 1,
      last_reminded_at TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      subtask_id TEXT NOT NULL REFERENCES subtasks(id),
      task_id TEXT NOT NULL REFERENCES tasks(id),
      status TEXT DEFAULT '',
      week_index INTEGER,
      progress_note TEXT DEFAULT '',
      delivery_doc_url TEXT DEFAULT '',
      payload_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_agent_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      action TEXT DEFAULT '',
      progress_note TEXT DEFAULT '',
      payload_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_agent_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      action TEXT DEFAULT '',
      progress_note TEXT DEFAULT '',
      payload_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      target_type TEXT NOT NULL DEFAULT 'task',
      target_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      adopted_at TEXT,
      adopted_by TEXT REFERENCES users(id),
      adopted_target TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feishu_report_subscriptions (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'boss',
      label TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      last_sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(chat_id, audience)
    );

    CREATE TABLE IF NOT EXISTS project_loops (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      loop_key TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      audience TEXT NOT NULL DEFAULT 'all',
      frequency TEXT NOT NULL DEFAULT 'weekly',
      prompt_text TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      last_prompt_week TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, loop_key)
    );

    CREATE TABLE IF NOT EXISTS project_loop_completions (
      id TEXT PRIMARY KEY,
      loop_id TEXT NOT NULL REFERENCES project_loops(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      week_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT DEFAULT '',
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(loop_id, user_id, week_key)
    );

    CREATE TABLE IF NOT EXISTS content_memos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      kind TEXT NOT NULL DEFAULT 'memo',
      sub_kind TEXT DEFAULT '',
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      timeline_text TEXT DEFAULT '',
      status TEXT DEFAULT 'open',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_memo_votes (
      memo_id TEXT NOT NULL REFERENCES content_memos(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      vote TEXT NOT NULL DEFAULT 'demo',
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (memo_id, user_id, vote)
    );

    CREATE TABLE IF NOT EXISTS content_memo_experiences (
      id TEXT PRIMARY KEY,
      memo_id TEXT NOT NULL REFERENCES content_memos(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('job_title')) {
    db.exec("ALTER TABLE users ADD COLUMN job_title TEXT DEFAULT ''");
  }
  if (!userCols.includes('job_level_id')) {
    db.exec("ALTER TABLE users ADD COLUMN job_level_id TEXT DEFAULT ''");
  }
  if (!userCols.includes('job_level_name')) {
    db.exec("ALTER TABLE users ADD COLUMN job_level_name TEXT DEFAULT ''");
  }
  if (!userCols.includes('employee_type')) {
    db.exec("ALTER TABLE users ADD COLUMN employee_type TEXT DEFAULT ''");
  }
  if (!userCols.includes('leader_user_id')) {
    db.exec("ALTER TABLE users ADD COLUMN leader_user_id TEXT DEFAULT ''");
  }

  const projectCols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
  if (!projectCols.includes('agent_api_key_hash')) {
    db.exec("ALTER TABLE projects ADD COLUMN agent_api_key_hash TEXT DEFAULT ''");
  }
  if (!projectCols.includes('agent_api_key_prefix')) {
    db.exec("ALTER TABLE projects ADD COLUMN agent_api_key_prefix TEXT DEFAULT ''");
  }
  if (!projectCols.includes('agent_instructions')) {
    db.exec("ALTER TABLE projects ADD COLUMN agent_instructions TEXT DEFAULT ''");
  }
  if (!projectCols.includes('agent_last_update_at')) {
    db.exec('ALTER TABLE projects ADD COLUMN agent_last_update_at TEXT');
  }
  if (!projectCols.includes('agent_progress_note')) {
    db.exec("ALTER TABLE projects ADD COLUMN agent_progress_note TEXT DEFAULT ''");
  }
  if (!projectCols.includes('progress_override')) {
    db.exec('ALTER TABLE projects ADD COLUMN progress_override INTEGER');
  }
  if (!projectCols.includes('feishu_progress_enabled')) {
    db.exec('ALTER TABLE projects ADD COLUMN feishu_progress_enabled INTEGER DEFAULT 0');
  }
  if (!projectCols.includes('feishu_progress_chat_id')) {
    db.exec("ALTER TABLE projects ADD COLUMN feishu_progress_chat_id TEXT DEFAULT ''");
  }
  if (!projectCols.includes('feishu_progress_frequency')) {
    db.exec("ALTER TABLE projects ADD COLUMN feishu_progress_frequency TEXT DEFAULT 'weekly'");
  }
  if (!projectCols.includes('feishu_progress_last_sent_at')) {
    db.exec('ALTER TABLE projects ADD COLUMN feishu_progress_last_sent_at TEXT');
  }
  if (!projectCols.includes('feishu_boss_enabled')) {
    db.exec('ALTER TABLE projects ADD COLUMN feishu_boss_enabled INTEGER DEFAULT 0');
  }
  if (!projectCols.includes('feishu_boss_chat_id')) {
    db.exec("ALTER TABLE projects ADD COLUMN feishu_boss_chat_id TEXT DEFAULT ''");
  }
  if (!projectCols.includes('feishu_boss_last_sent_at')) {
    db.exec('ALTER TABLE projects ADD COLUMN feishu_boss_last_sent_at TEXT');
  }

  const memoCols = db.prepare('PRAGMA table_info(content_memos)').all().map((c) => c.name);
  if (!memoCols.includes('sub_kind')) {
    db.exec("ALTER TABLE content_memos ADD COLUMN sub_kind TEXT DEFAULT ''");
  }
  if (!memoCols.includes('owner_text')) {
    db.exec("ALTER TABLE content_memos ADD COLUMN owner_text TEXT DEFAULT ''");
  }
  if (!memoCols.includes('progress')) {
    db.exec('ALTER TABLE content_memos ADD COLUMN progress INTEGER DEFAULT 0');
  }
  if (!memoCols.includes('meeting_doc_url')) {
    db.exec("ALTER TABLE content_memos ADD COLUMN meeting_doc_url TEXT DEFAULT ''");
  }
  if (!memoCols.includes('meeting_minutes_url')) {
    db.exec("ALTER TABLE content_memos ADD COLUMN meeting_minutes_url TEXT DEFAULT ''");
  }

  const moduleCols = db.prepare('PRAGMA table_info(project_modules)').all().map((c) => c.name);
  if (!moduleCols.includes('owner_id')) {
    db.exec('ALTER TABLE project_modules ADD COLUMN owner_id TEXT');
  }
  if (!moduleCols.includes('owner_assigned_by')) {
    db.exec('ALTER TABLE project_modules ADD COLUMN owner_assigned_by TEXT');
  }
  if (!moduleCols.includes('owner_assigned_at')) {
    db.exec('ALTER TABLE project_modules ADD COLUMN owner_assigned_at TEXT');
  }

  const taskCols = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
  if (!taskCols.includes('module_key')) {
    db.exec("ALTER TABLE tasks ADD COLUMN module_key TEXT DEFAULT 'main'");
  }
  if (!taskCols.includes('module_name')) {
    db.exec("ALTER TABLE tasks ADD COLUMN module_name TEXT DEFAULT '主模块'");
  }
  if (!taskCols.includes('agent_api_key_hash')) {
    db.exec("ALTER TABLE tasks ADD COLUMN agent_api_key_hash TEXT DEFAULT ''");
  }
  if (!taskCols.includes('agent_api_key_prefix')) {
    db.exec("ALTER TABLE tasks ADD COLUMN agent_api_key_prefix TEXT DEFAULT ''");
  }
  if (!taskCols.includes('agent_instructions')) {
    db.exec("ALTER TABLE tasks ADD COLUMN agent_instructions TEXT DEFAULT ''");
  }
  if (!taskCols.includes('agent_progress_note')) {
    db.exec("ALTER TABLE tasks ADD COLUMN agent_progress_note TEXT DEFAULT ''");
  }
  if (!taskCols.includes('agent_last_update_at')) {
    db.exec('ALTER TABLE tasks ADD COLUMN agent_last_update_at TEXT');
  }
  if (!taskCols.includes('idea_text')) {
    db.exec("ALTER TABLE tasks ADD COLUMN idea_text TEXT DEFAULT ''");
  }
  if (!taskCols.includes('execution_plan')) {
    db.exec("ALTER TABLE tasks ADD COLUMN execution_plan TEXT DEFAULT ''");
  }
  if (!taskCols.includes('resource_plan')) {
    db.exec("ALTER TABLE tasks ADD COLUMN resource_plan TEXT DEFAULT ''");
  }
  if (!taskCols.includes('ai_detail_json')) {
    db.exec("ALTER TABLE tasks ADD COLUMN ai_detail_json TEXT DEFAULT '{}'");
  }

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
  if (!subCols.includes('delivery_doc_url')) {
    db.exec("ALTER TABLE subtasks ADD COLUMN delivery_doc_url TEXT DEFAULT ''");
  }
  if (!subCols.includes('agent_api_key_hash')) {
    db.exec("ALTER TABLE subtasks ADD COLUMN agent_api_key_hash TEXT DEFAULT ''");
  }
  if (!subCols.includes('agent_api_key_prefix')) {
    db.exec("ALTER TABLE subtasks ADD COLUMN agent_api_key_prefix TEXT DEFAULT ''");
  }
  if (!subCols.includes('agent_instructions')) {
    db.exec("ALTER TABLE subtasks ADD COLUMN agent_instructions TEXT DEFAULT ''");
  }
  if (!subCols.includes('agent_progress_note')) {
    db.exec("ALTER TABLE subtasks ADD COLUMN agent_progress_note TEXT DEFAULT ''");
  }
  if (!subCols.includes('agent_last_update_at')) {
    db.exec('ALTER TABLE subtasks ADD COLUMN agent_last_update_at TEXT');
  }
  if (!subCols.includes('feishu_push_enabled')) {
    db.exec('ALTER TABLE subtasks ADD COLUMN feishu_push_enabled INTEGER DEFAULT 0');
  }
  if (!subCols.includes('feishu_chat_id')) {
    db.exec("ALTER TABLE subtasks ADD COLUMN feishu_chat_id TEXT DEFAULT ''");
  }
  if (!subCols.includes('idea_text')) {
    db.exec("ALTER TABLE subtasks ADD COLUMN idea_text TEXT DEFAULT ''");
  }
  if (!subCols.includes('execution_plan')) {
    db.exec("ALTER TABLE subtasks ADD COLUMN execution_plan TEXT DEFAULT ''");
  }
  if (!subCols.includes('resource_plan')) {
    db.exec("ALTER TABLE subtasks ADD COLUMN resource_plan TEXT DEFAULT ''");
  }
  if (!subCols.includes('ai_detail_json')) {
    db.exec("ALTER TABLE subtasks ADD COLUMN ai_detail_json TEXT DEFAULT '{}'");
  }

  const stepCols = db.prepare('PRAGMA table_info(subtask_steps)').all().map((c) => c.name);
  if (!stepCols.includes('delivery_doc_url')) {
    db.exec("ALTER TABLE subtask_steps ADD COLUMN delivery_doc_url TEXT DEFAULT ''");
  }

  const commentCols = db.prepare('PRAGMA table_info(task_comments)').all().map((c) => c.name);
  if (!commentCols.includes('adopted_at')) {
    db.exec('ALTER TABLE task_comments ADD COLUMN adopted_at TEXT');
  }
  if (!commentCols.includes('adopted_by')) {
    db.exec('ALTER TABLE task_comments ADD COLUMN adopted_by TEXT');
  }
  if (!commentCols.includes('adopted_target')) {
    db.exec("ALTER TABLE task_comments ADD COLUMN adopted_target TEXT DEFAULT ''");
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
