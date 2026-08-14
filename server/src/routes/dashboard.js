import { Router } from 'express';
import { authRequired, canAccessProject } from '../middleware/auth.js';
import * as taskService from '../services/task.js';
import * as loopService from '../services/loop.js';
import db from '../db/connection.js';

const router = Router();

function percent(done, total) {
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

function projectProgress(projectId, override) {
  if (override !== null && override !== undefined) return Number(override);
  const row = db.prepare(`
    SELECT COALESCE(AVG(progress), 0) as progress
    FROM tasks
    WHERE project_id = ? AND is_published = 1
  `).get(projectId);
  return Math.round(Number(row?.progress || 0));
}

function summarizeTeam(team) {
  const projects = db.prepare(`
    SELECT p.*, u.name as pm_name, u.avatar_url as pm_avatar
    FROM projects p JOIN users u ON p.pm_user_id = u.id
    WHERE p.team_id = ?
    ORDER BY p.updated_at DESC, p.created_at DESC
  `).all(team.id);

  const projectIds = projects.map((project) => project.id);
  const empty = {
    topics: { total: 0, progress: 0, daily: { total: 0, planned: 0 }, deep: { total: 0, planned: 0 }, recent: [] },
    demo: { total: 0, ready: 0, progress: 0, recent: [] },
    eval: { total: 0, done: 0, progress: 0, recent: [] },
    build: { total: 0, active: 0, completed: 0, tasks: 0, progress: 0, recent: [] },
  };
  if (!projectIds.length) return { ...team, members_count: team.members_count || 0, sections: empty };

  const placeholders = projectIds.map(() => '?').join(',');
  const memos = db.prepare(`
    SELECT m.*, p.name as project_name, u.name as created_by_name,
      COUNT(DISTINCT v.user_id) as vote_count,
      COUNT(DISTINCT e.id) as experience_count
    FROM content_memos m
    JOIN projects p ON p.id = m.project_id
    JOIN users u ON u.id = m.created_by
    LEFT JOIN content_memo_votes v ON v.memo_id = m.id AND v.vote = 'demo'
    LEFT JOIN content_memo_experiences e ON e.memo_id = m.id
    WHERE m.project_id IN (${placeholders})
    GROUP BY m.id
    ORDER BY m.updated_at DESC, m.created_at DESC
  `).all(...projectIds);

  const teamSize = Number(team.members_count || 1);
  const demoThreshold = Math.max(1, Math.ceil(teamSize / 2));
  const topicMemos = memos.filter((memo) => memo.kind === 'topic');
  const dailyTopics = topicMemos.filter((memo) => memo.sub_kind !== 'deep');
  const deepTopics = topicMemos.filter((memo) => memo.sub_kind === 'deep');
  const plannedTopics = topicMemos.filter((memo) => String(memo.timeline_text || '').trim()).length;
  const demoMemos = memos.filter((memo) => memo.kind === 'demo');
  const evalMemos = memos.filter((memo) => (
    memo.kind === 'eval' || /eval|评测|测评|测试|benchmark/i.test(`${memo.title} ${memo.body}`)
  ));

  const tasks = db.prepare(`
    SELECT t.*, p.name as project_name, u.name as owner_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.owner_id
    WHERE t.project_id IN (${placeholders}) AND t.is_published = 1
    ORDER BY t.updated_at DESC, t.created_at DESC
  `).all(...projectIds);
  const evalTasks = tasks.filter((task) => /eval|评测|测评|测试|benchmark/i.test(`${task.module_name} ${task.title} ${task.summary}`));
  const buildProgress = projects.length
    ? Math.round(projects.reduce((sum, project) => sum + projectProgress(project.id, project.progress_override), 0) / projects.length)
    : 0;
  const evalTotal = evalMemos.length + evalTasks.length;
  const evalDone = evalMemos.filter((memo) => ['done', 'completed', '已完成'].includes(memo.status)).length
    + evalTasks.filter((task) => task.status === '已完成' || Number(task.progress || 0) >= 100).length;

  return {
    ...team,
    members_count: team.members_count || 0,
    sections: {
      topics: {
        total: topicMemos.length,
        progress: percent(plannedTopics, topicMemos.length),
        daily: {
          total: dailyTopics.length,
          planned: dailyTopics.filter((memo) => String(memo.timeline_text || '').trim()).length,
        },
        deep: {
          total: deepTopics.length,
          planned: deepTopics.filter((memo) => String(memo.timeline_text || '').trim()).length,
        },
        recent: topicMemos,
      },
      demo: {
        total: demoMemos.length,
        ready: demoMemos.filter((memo) => Number(memo.vote_count || 0) >= demoThreshold).length,
        progress: percent(demoMemos.filter((memo) => Number(memo.vote_count || 0) >= demoThreshold).length, demoMemos.length),
        recent: demoMemos,
      },
      eval: {
        total: evalTotal,
        done: evalDone,
        progress: evalTotal ? percent(evalDone, evalTotal) : 0,
        recent: [
          ...evalMemos.map((memo) => ({ ...memo, source: 'memo' })),
          ...evalTasks.map((task) => ({ ...task, source: 'task', title: task.title })),
        ],
      },
      build: {
        total: projects.length,
        active: projects.filter((project) => project.status === 'active').length,
        completed: projects.filter((project) => project.status === 'completed').length,
        tasks: tasks.length,
        progress: buildProgress,
        recent: projects.map((project) => ({ ...project, progress: projectProgress(project.id, project.progress_override) })),
      },
    },
  };
}

// Commander dashboard: all tasks with subtasks and updates
router.get('/commander', authRequired, (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ ok: false, error: '请指定项目' });
  const access = canAccessProject(projectId, req.user.id);
  if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

  const project = db.prepare(`
    SELECT p.*, u.name as pm_name, u.avatar_url as pm_avatar
    FROM projects p JOIN users u ON p.pm_user_id = u.id WHERE p.id = ?
  `).get(projectId);

  const tasks = db.prepare(`
    SELECT t.*, u.name as owner_name, u.avatar_url as owner_avatar
    FROM tasks t LEFT JOIN users u ON t.owner_id = u.id
    WHERE t.project_id = ? AND t.is_published = 1
    ORDER BY t.sort_order
  `).all(projectId);

  for (const task of tasks) {
    task.subtasks = db.prepare(`
      SELECT s.*, u.name as assignee_name FROM subtasks s
      LEFT JOIN users u ON s.assignee_id = u.id WHERE s.task_id = ?
      ORDER BY s.sort_order
    `).all(task.id);
    task.updates = db.prepare(`
      SELECT pu.*, u.name as user_name FROM progress_updates pu
      JOIN users u ON pu.user_id = u.id WHERE pu.task_id = ?
      ORDER BY pu.created_at DESC
    `).all(task.id);
  }

  const teamMembers = db.prepare(`
    SELECT u.*, tm.role FROM users u
    JOIN team_members tm ON u.id = tm.user_id
    WHERE tm.team_id = (SELECT team_id FROM projects WHERE id = ?)
  `).all(projectId);

  // Workload: count tasks per member
  const workloads = teamMembers.map(m => {
    const pmTasks = tasks.filter(t => t.owner_id === m.id);
    const helperSubtasks = db.prepare(`
      SELECT COUNT(*) as count FROM subtasks s
      JOIN tasks t ON s.task_id = t.id
      WHERE s.assignee_id = ? AND t.project_id = ? AND t.owner_id != ?
    `).get(m.id, projectId, m.id);
    return { user: m, pmCount: pmTasks.length, helperCount: helperSubtasks.count };
  });

  res.json({ ok: true, data: { project, tasks, teamMembers, workloads } });
});

// Personal panel: tasks I own + subtasks assigned to me
router.get('/personal', authRequired, (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ ok: false, error: '请指定项目' });
  const access = canAccessProject(projectId, req.user.id);
  if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

  const myTasks = db.prepare(`
    SELECT t.* FROM tasks t
    WHERE t.project_id = ? AND t.owner_id = ? AND t.is_published = 1
    ORDER BY t.sort_order
  `).all(projectId, req.user.id);

  for (const task of myTasks) {
    task.subtasks = taskService.attachSubtaskPayloads(db.prepare(`
      SELECT s.*, u.name as assignee_name, u.avatar_url as assignee_avatar
      FROM subtasks s
      LEFT JOIN users u ON s.assignee_id = u.id WHERE s.task_id = ?
      ORDER BY s.sort_order, s.created_at
    `).all(task.id));
    task.updates = db.prepare(`
      SELECT pu.*, u.name as user_name FROM progress_updates pu
      JOIN users u ON pu.user_id = u.id WHERE pu.task_id = ?
      ORDER BY pu.created_at DESC LIMIT 5
    `).all(task.id);
  }

  const mySubtasks = taskService.attachSubtaskPayloads(db.prepare(`
    SELECT s.*, t.title as task_title, t.id as task_id, t.owner_id, t.status as task_status
    FROM subtasks s
    JOIN tasks t ON s.task_id = t.id
    WHERE s.assignee_id = ? AND t.project_id = ? AND t.is_published = 1
    ORDER BY s.status, s.created_at
  `).all(req.user.id, projectId));

  const myStages = db.prepare(`
    SELECT
      st.*,
      s.title as subtask_title,
      s.assignee_id,
      t.title as task_title,
      t.id as task_id,
      t.owner_id
    FROM subtask_steps st
    JOIN subtasks s ON st.subtask_id = s.id
    JOIN tasks t ON st.task_id = t.id
    WHERE t.project_id = ?
      AND t.is_published = 1
      AND (t.owner_id = ? OR s.assignee_id = ?)
    ORDER BY
      CASE st.status WHEN '进行中' THEN 0 WHEN '待开始' THEN 1 WHEN '已完成' THEN 2 ELSE 3 END,
      st.sort_order,
      st.created_at
  `).all(projectId, req.user.id, req.user.id);

  const project = db.prepare('SELECT pm_user_id FROM projects WHERE id = ?').get(projectId);
  const isProjectPM = project?.pm_user_id === req.user.id;
  const pendingTaskReviews = isProjectPM ? db.prepare(`
    SELECT t.*, u.name as owner_name, u.avatar_url as owner_avatar
    FROM tasks t LEFT JOIN users u ON t.owner_id = u.id
    WHERE t.project_id = ? AND t.status = '审核中' AND t.is_published = 1
    ORDER BY t.updated_at DESC
  `).all(projectId) : [];
  const pendingSubtaskReviews = isProjectPM ? db.prepare(`
    SELECT s.*, t.title as task_title, t.id as task_id, u.name as submitted_by_name
    FROM subtasks s
    JOIN tasks t ON s.task_id = t.id
    LEFT JOIN users u ON s.submitted_by = u.id
    WHERE t.project_id = ? AND s.status = '已提交' AND t.is_published = 1
    ORDER BY s.submitted_at DESC
  `).all(projectId) : [];

  const claimable = db.prepare(`
    SELECT t.* FROM tasks t
    WHERE t.project_id = ? AND t.owner_id IS NULL AND t.is_published = 1
    ORDER BY t.sort_order
  `).all(projectId);
  const loops = loopService.listUserLoops(projectId, req.user.id);

  res.json({
    ok: true,
    data: {
      myTasks,
      mySubtasks,
      myStages,
      claimable,
      isProjectPM,
      pendingTaskReviews,
      pendingSubtaskReviews,
      loops,
    },
  });
});

// Boss board: all projects in a team
router.get('/boss', authRequired, (req, res) => {
  const { teamId } = req.query;
  if (!teamId) return res.status(400).json({ ok: false, error: '请指定团队' });

  const projects = db.prepare(`
    SELECT p.*, u.name as pm_name, u.avatar_url as pm_avatar
    FROM projects p JOIN users u ON p.pm_user_id = u.id
    WHERE p.team_id = ?
    ORDER BY p.created_at DESC
  `).all(teamId);

  for (const project of projects) {
    project.tasks = db.prepare(`
      SELECT t.*, u.name as owner_name FROM tasks t
      LEFT JOIN users u ON t.owner_id = u.id
      WHERE t.project_id = ? AND t.is_published = 1
      ORDER BY t.sort_order
    `).all(project.id);
  }

  res.json({ ok: true, data: projects });
});

router.get('/department', authRequired, (req, res) => {
  const teams = db.prepare(`
    SELECT
      t.*,
      MAX(CASE WHEN tm.user_id = ? THEN tm.role ELSE '' END) as my_role,
      COUNT(DISTINCT all_tm.user_id) as members_count,
      COUNT(DISTINCT p.id) as projects_count
    FROM teams t
    LEFT JOIN team_members tm ON tm.team_id = t.id
    LEFT JOIN team_members all_tm ON all_tm.team_id = t.id
    LEFT JOIN projects p ON p.team_id = t.id
    GROUP BY t.id
    ORDER BY
      CASE WHEN LOWER(t.name) LIKE '%evolve%' THEN 0 ELSE 1 END,
      t.created_at DESC
  `).all(req.user.id);

  const sections = {
    topics: { total: 0, progress: 0, dailyTotal: 0, dailyPlanned: 0, deepTotal: 0, deepPlanned: 0, dailyItems: [], deepItems: [] },
    demo: { total: 0, ready: 0, progress: 0, items: [] },
    eval: { total: 0, done: 0, progress: 0, items: [] },
    build: { total: 0, active: 0, completed: 0, tasks: 0, progress: 0, items: [] },
  };
  const teamRows = teams.map(summarizeTeam);

  for (const team of teamRows) {
    sections.topics.total += team.sections.topics.total;
    sections.topics.dailyTotal += team.sections.topics.daily.total;
    sections.topics.dailyPlanned += team.sections.topics.daily.planned;
    sections.topics.deepTotal += team.sections.topics.deep.total;
    sections.topics.deepPlanned += team.sections.topics.deep.planned;
    sections.topics.dailyItems.push(...team.sections.topics.recent.filter((item) => item.sub_kind !== 'deep').map((item) => ({ ...item, team_name: team.name })));
    sections.topics.deepItems.push(...team.sections.topics.recent.filter((item) => item.sub_kind === 'deep').map((item) => ({ ...item, team_name: team.name })));
    sections.demo.total += team.sections.demo.total;
    sections.demo.ready += team.sections.demo.ready;
    sections.demo.items.push(...team.sections.demo.recent.map((item) => ({ ...item, team_name: team.name })));
    sections.eval.total += team.sections.eval.total;
    sections.eval.done += team.sections.eval.done;
    sections.eval.items.push(...team.sections.eval.recent.map((item) => ({ ...item, team_name: team.name })));
    sections.build.total += team.sections.build.total;
    sections.build.active += team.sections.build.active;
    sections.build.completed += team.sections.build.completed;
    sections.build.tasks += team.sections.build.tasks;
    sections.build.items.push(...team.sections.build.recent.map((item) => ({ ...item, team_name: team.name })));
  }

  sections.topics.progress = percent(sections.topics.dailyPlanned + sections.topics.deepPlanned, sections.topics.total);
  sections.demo.progress = percent(sections.demo.ready, sections.demo.total);
  sections.eval.progress = percent(sections.eval.done, sections.eval.total);
  sections.build.progress = teamRows.length
    ? Math.round(teamRows.reduce((sum, team) => sum + team.sections.build.progress, 0) / teamRows.length)
    : 0;

  res.json({ ok: true, data: { teams: teamRows, sections } });
});

export default router;
