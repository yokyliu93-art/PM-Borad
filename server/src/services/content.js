import { v4 as uuid } from 'uuid';
import db from '../db/connection.js';
import { config } from '../config.js';
import * as aiService from './ai.js';
import * as feishuService from './feishu.js';
import * as feishuPushService from './feishuPush.js';

function normalizeKind(kind = '') {
  const value = String(kind || '').trim();
  if (['demo', 'meeting', 'topic', 'memo', 'eval'].includes(value)) return value;
  if (value.includes('例会')) return 'meeting';
  if (value.includes('选题')) return 'topic';
  if (value.toLowerCase().includes('demo')) return 'demo';
  return 'memo';
}

function normalizeSubKind(subKind = '') {
  const value = String(subKind || '').trim();
  if (['daily', 'deep'].includes(value)) return value;
  if (value.includes('深度')) return 'deep';
  return value ? 'daily' : '';
}

function teamSize(projectId) {
  const project = db.prepare('SELECT team_id FROM projects WHERE id = ?').get(projectId);
  if (!project) return 0;
  const row = db.prepare('SELECT COUNT(*) as c FROM team_members WHERE team_id = ?').get(project.team_id);
  return Number(row?.c || 0);
}

function hydrateMemo(row, totalMembers) {
  if (!row) return null;
  const voteCount = Number(row.vote_count || 0);
  const threshold = Math.max(1, Math.ceil((totalMembers || 1) / 2));
  return {
    ...row,
    vote_count: voteCount,
    experience_count: Number(row.experience_count || 0),
    demo_threshold: threshold,
    demo_ready: voteCount >= threshold,
    experiences: db.prepare(`
      SELECT e.*, u.name as user_name, u.avatar_url as user_avatar
      FROM content_memo_experiences e
      JOIN users u ON u.id = e.user_id
      WHERE e.memo_id = ?
      ORDER BY e.created_at DESC
    `).all(row.id),
    eval_questions: row.kind === 'eval' ? db.prepare(`
      SELECT *
      FROM content_eval_questions
      WHERE memo_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `).all(row.id) : [],
  };
}

export function listByProject(projectId, userId, kind = '') {
  const totalMembers = teamSize(projectId);
  const params = [userId || '', projectId];
  const kindFilter = normalizeKind(kind);
  const whereKind = kind ? 'AND m.kind = ?' : '';
  if (kind) params.push(kindFilter);
  const rows = db.prepare(`
    SELECT
      m.*,
      p.name as project_name,
      u.name as created_by_name,
      u.avatar_url as created_by_avatar,
      COUNT(DISTINCT v.user_id) as vote_count,
      COUNT(DISTINCT e.id) as experience_count,
      MAX(CASE WHEN myv.user_id IS NOT NULL THEN 1 ELSE 0 END) as my_vote
    FROM content_memos m
    JOIN projects p ON p.id = m.project_id
    JOIN users u ON u.id = m.created_by
    LEFT JOIN content_memo_votes v ON v.memo_id = m.id AND v.vote = 'demo'
    LEFT JOIN content_memo_votes myv ON myv.memo_id = m.id AND myv.vote = 'demo' AND myv.user_id = ?
    LEFT JOIN content_memo_experiences e ON e.memo_id = m.id
    WHERE m.project_id = ? ${whereKind}
    GROUP BY m.id
    ORDER BY m.updated_at DESC, m.created_at DESC
  `).all(...params);
  return rows.map((row) => hydrateMemo(row, totalMembers));
}

export function listByTeam(teamId, userId, filters = {}) {
  const kind = filters.kind ? normalizeKind(filters.kind) : '';
  const subKind = filters.subKind || filters.sub_kind ? normalizeSubKind(filters.subKind || filters.sub_kind) : '';
  const totalMembers = Number(db.prepare('SELECT COUNT(*) as c FROM team_members WHERE team_id = ?').get(teamId)?.c || 0);
  const params = [userId || '', teamId];
  const where = [];
  if (kind) {
    where.push('m.kind = ?');
    params.push(kind);
  }
  if (subKind) {
    where.push('m.sub_kind = ?');
    params.push(subKind);
  }
  const rows = db.prepare(`
    SELECT
      m.*,
      p.name as project_name,
      u.name as created_by_name,
      u.avatar_url as created_by_avatar,
      COUNT(DISTINCT v.user_id) as vote_count,
      COUNT(DISTINCT e.id) as experience_count,
      MAX(CASE WHEN myv.user_id IS NOT NULL THEN 1 ELSE 0 END) as my_vote
    FROM content_memos m
    JOIN projects p ON p.id = m.project_id
    JOIN users u ON u.id = m.created_by
    LEFT JOIN content_memo_votes v ON v.memo_id = m.id AND v.vote = 'demo'
    LEFT JOIN content_memo_votes myv ON myv.memo_id = m.id AND myv.vote = 'demo' AND myv.user_id = ?
    LEFT JOIN content_memo_experiences e ON e.memo_id = m.id
    WHERE p.team_id = ? ${where.length ? `AND ${where.join(' AND ')}` : ''}
    GROUP BY m.id
    ORDER BY m.updated_at DESC, m.created_at DESC
  `).all(...params);
  return rows.map((row) => hydrateMemo(row, totalMembers));
}

export function create(projectId, userId, fields = {}) {
  const title = String(fields.title || '').trim();
  if (!title) throw new Error('标题不能为空');
  const id = uuid();
  db.prepare(`
    INSERT INTO content_memos (
      id, project_id, kind, sub_kind, title, body, source_url, timeline_text,
      status, owner_text, progress, meeting_doc_url, meeting_minutes_url, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    projectId,
    normalizeKind(fields.kind),
    normalizeSubKind(fields.subKind || fields.sub_kind),
    title,
    fields.body || '',
    fields.sourceUrl || fields.source_url || '',
    fields.timelineText || fields.timeline_text || '',
    fields.status || 'open',
    fields.ownerText || fields.owner_text || '',
    Math.min(100, Math.max(0, Math.round(Number(fields.progress || 0)))),
    fields.meetingDocUrl || fields.meeting_doc_url || fields.weeklyDocUrl || fields.weekly_doc_url || '',
    fields.meetingMinutesUrl || fields.meeting_minutes_url || fields.minutesUrl || fields.minutes_url || '',
    userId
  );
  return get(projectId, id, userId);
}

export function get(projectId, memoId, userId) {
  return listByProject(projectId, userId).find((memo) => memo.id === memoId) || null;
}

export function voteDemo(projectId, memoId, userId) {
  const memo = db.prepare('SELECT id FROM content_memos WHERE id = ? AND project_id = ?').get(memoId, projectId);
  if (!memo) throw new Error('Memo 不存在');
  db.prepare(`
    INSERT OR IGNORE INTO content_memo_votes (memo_id, user_id, vote)
    VALUES (?, ?, 'demo')
  `).run(memoId, userId);
  db.prepare("UPDATE content_memos SET updated_at = datetime('now') WHERE id = ?").run(memoId);
  return get(projectId, memoId, userId);
}

export function getMemoProjectId(memoId) {
  const row = db.prepare('SELECT project_id FROM content_memos WHERE id = ?').get(memoId);
  return row?.project_id || '';
}

export function unvoteDemo(projectId, memoId, userId) {
  db.prepare("DELETE FROM content_memo_votes WHERE memo_id = ? AND user_id = ? AND vote = 'demo'").run(memoId, userId);
  db.prepare("UPDATE content_memos SET updated_at = datetime('now') WHERE id = ?").run(memoId);
  return get(projectId, memoId, userId);
}

export function addExperience(projectId, memoId, userId, content) {
  const text = String(content || '').trim();
  if (!text) throw new Error('试用体验不能为空');
  const memo = db.prepare('SELECT id FROM content_memos WHERE id = ? AND project_id = ?').get(memoId, projectId);
  if (!memo) throw new Error('Memo 不存在');
  db.prepare(`
    INSERT INTO content_memo_experiences (id, memo_id, user_id, content)
    VALUES (?, ?, ?, ?)
  `).run(uuid(), memoId, userId, text);
  db.prepare("UPDATE content_memos SET updated_at = datetime('now') WHERE id = ?").run(memoId);
  return get(projectId, memoId, userId);
}

export function importMinutes(projectId, userId, fields = {}) {
  const title = String(fields.title || '例会速记导入').trim();
  const transcript = String(fields.transcript || fields.content || '').trim();
  const meetingDocUrl = fields.meetingDocUrl || fields.meeting_doc_url || fields.weeklyDocUrl || fields.weekly_doc_url || '';
  const meetingMinutesUrl = fields.meetingMinutesUrl || fields.meeting_minutes_url || fields.minutesUrl || fields.minutes_url || fields.sourceUrl || fields.source_url || '';
  if (!transcript && !meetingDocUrl && !meetingMinutesUrl) throw new Error('请提供周会文档、周会速记文档链接或速记文字记录');
  const memo = create(projectId, userId, {
    kind: 'meeting',
    title,
    body: transcript || '已记录周会文档和周会速记文档，等待拆解选题。',
    sourceUrl: meetingMinutesUrl || meetingDocUrl,
    meetingDocUrl,
    meetingMinutesUrl,
  });
  const topicLines = transcript
    .split(/\n+/)
    .map((line) => line.replace(/^[-*#\d.、\s]+/, '').trim())
    .filter((line) => /选题|demo|报道|采访|上线|发布|推荐/.test(line))
    .slice(0, 8);
  const topics = topicLines.map((line) => create(projectId, userId, {
    kind: 'topic',
    subKind: /深度|长线|专题|系列|调查|深挖|long/i.test(line) ? 'deep' : 'daily',
    title: line.slice(0, 48),
    body: `来自例会「${title}」：${line}`,
    ownerText: fields.ownerText || fields.owner_text || '待分配',
    progress: 0,
    timelineText: /深度|长线|专题|系列|调查|深挖|long/i.test(line)
      ? `W1：确认角度、资料和采访对象\nW2-W3：采访、试用、资料整理\nW4：成稿、编辑、发布与复盘`
      : `执行：确认负责人、采访/试用、成稿或 Demo 时间。`,
    sourceUrl: meetingMinutesUrl || meetingDocUrl,
    meetingDocUrl,
    meetingMinutesUrl,
  }));
  return { meeting: memo, topics };
}

function topicTimelineText(topic, deep = false) {
  if (Array.isArray(topic.timeline) && topic.timeline.length) {
    return topic.timeline
      .map((item, index) => {
        if (Array.isArray(item)) return `${item[0] || `W${index + 1}`}：${item[1] || ''}`.trim();
        return `${item.week || item.time || `W${index + 1}`}：${item.detail || item.plan || item.summary || ''}`.trim();
      })
      .join('\n');
  }
  if (deep) {
    return [
      'W1：确认角度、资料和采访对象',
      'W2-W3：采访、试用、资料整理',
      'W4：成稿、编辑、发布与复盘',
    ].join('\n');
  }
  return topic.firstDraftAt ? `初稿时间：${topic.firstDraftAt}` : '初稿时间：待定';
}

function evalTimelineText(evalSet) {
  if (Array.isArray(evalSet.timeline) && evalSet.timeline.length) {
    return evalSet.timeline
      .map((item, index) => {
        if (Array.isArray(item)) return `${item[0] || `阶段${index + 1}`}：${item[1] || ''}`.trim();
        return `${item.phase || item.week || item.time || `阶段${index + 1}`}：${item.detail || item.plan || item.summary || ''}`.trim();
      })
      .filter(Boolean)
      .join('\n');
  }
  return '待补充：评测范围、样本集、执行方式和验收标准。';
}

function saveEvalQuestions(memoId, questions = [], fallbackDocContent = '') {
  const list = Array.isArray(questions) ? questions : [];
  const normalized = list.length ? list : [{
    title: '测试题 1',
    prompt: fallbackDocContent,
    input: '',
    expectedOutput: '',
    evaluationCriteria: '根据测试集文档要求判断模型输出是否满足任务目标。',
    referenceAnswer: '',
  }];
  const stmt = db.prepare(`
    INSERT INTO content_eval_questions (
      id, memo_id, title, prompt_text, input_text, expected_output,
      evaluation_criteria, reference_answer, sort_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction(() => {
    normalized.forEach((question, index) => {
      const title = String(question.title || `第 ${index + 1} 题`).trim();
      const payload = {
        title,
        prompt: String(question.prompt || question.promptText || '').trim(),
        input: String(question.input || question.inputText || '').trim(),
        expectedOutput: String(question.expectedOutput || question.expected_output || '').trim(),
        evaluationCriteria: String(question.evaluationCriteria || question.evaluation_criteria || '').trim(),
        referenceAnswer: String(question.referenceAnswer || question.reference_answer || '').trim(),
      };
      stmt.run(
        uuid(),
        memoId,
        payload.title,
        payload.prompt,
        payload.input,
        payload.expectedOutput,
        payload.evaluationCriteria,
        payload.referenceAnswer,
        index
      );
    });
  });
  insertMany();
}

export async function importEvalDoc(projectId, userId, fields = {}) {
  const docUrl = String(fields.docUrl || fields.doc_url || fields.sourceUrl || fields.source_url || '').trim();
  if (!docUrl) throw new Error('请提供测试集飞书文档链接');
  const doc = await feishuService.fetchDocContent(userId, docUrl);
  const parsed = await aiService.parseEvalDoc({ doc });
  const memo = create(projectId, userId, {
    kind: 'eval',
    title: parsed.title || doc.title || '未命名测试集',
    body: [
      parsed.summary || '已从飞书文档生成测试集。',
      parsed.questions?.length ? `共解析出 ${parsed.questions.length} 道测试题。` : '',
    ].filter(Boolean).join('\n'),
    sourceUrl: docUrl,
    ownerText: fields.ownerText || fields.owner_text || parsed.owner || '待分配',
    progress: fields.progress ?? parsed.progress ?? 0,
    timelineText: evalTimelineText(parsed),
  });
  saveEvalQuestions(memo.id, parsed.questions, doc.content);
  return {
    evalSet: get(projectId, memo.id, userId),
    source: { title: doc.title, url: docUrl },
  };
}

function findUserByName(name = '', projectId = '') {
  const clean = String(name || '').trim();
  if (!clean || clean === '待定' || clean === '待分配') return null;
  const exact = db.prepare(`
    SELECT u.*
    FROM users u
    JOIN team_members tm ON tm.user_id = u.id
    JOIN projects p ON p.team_id = tm.team_id
    WHERE p.id = ? AND u.name = ?
    LIMIT 1
  `).get(projectId, clean);
  if (exact) return exact;
  return db.prepare(`
    SELECT u.*
    FROM users u
    JOIN team_members tm ON tm.user_id = u.id
    JOIN projects p ON p.team_id = tm.team_id
    WHERE p.id = ? AND (u.name LIKE ? OR ? LIKE '%' || u.name || '%')
    ORDER BY LENGTH(u.name) DESC
    LIMIT 1
  `).get(projectId, `%${clean}%`, clean);
}

async function notifyTopicOwner({ ownerName, projectId, title, firstDraftAt, summary, boardUrl }) {
  const user = findUserByName(ownerName, projectId);
  if (!user) return { ownerName, pushed: false, reason: '未匹配到成员' };
  try {
    await feishuPushService.sendTextToUser(
      user.id,
      [
        `PM Board 选题负责人提醒：${title}`,
        ownerName ? `负责人：${ownerName}` : '',
        firstDraftAt ? `初稿时间：${firstDraftAt}` : '',
        summary ? `说明：${summary}` : '',
        boardUrl ? `打开看板：${boardUrl}` : '',
      ].filter(Boolean).join('\n')
    );
    return { ownerName, userId: user.id, pushed: true };
  } catch (err) {
    return { ownerName, userId: user.id, pushed: false, reason: err.userMessage || err.message };
  }
}

export async function parseWeeklyTopics(projectId, userId, fields = {}) {
  const meetingDocUrl = String(fields.meetingDocUrl || fields.meeting_doc_url || '').trim();
  const meetingNotesUrl = String(fields.meetingNotesUrl || fields.meeting_notes_url || fields.meetingMinutesUrl || fields.meeting_minutes_url || '').trim();
  if (!meetingDocUrl) throw new Error('请提供周会文档链接');
  if (!meetingNotesUrl) throw new Error('请提供周会速记文档链接');

  const [meetingDoc, meetingNotes] = await Promise.all([
    feishuService.fetchDocContent(userId, meetingDocUrl),
    feishuService.fetchDocContent(userId, meetingNotesUrl),
  ]);
  const parsed = await aiService.parseWeeklyTopics({ meetingDoc, meetingNotes });
  const meeting = create(projectId, userId, {
    kind: 'meeting',
    title: fields.title || meetingDoc.title || '周会选题解析',
    body: [
      `周会文档：${meetingDoc.title || meetingDocUrl}`,
      `周会速记文档：${meetingNotes.title || meetingNotesUrl}`,
      `DeepSeek 已解析出 ${parsed.dailyTopics.length} 个日常选题、${parsed.deepTopics.length} 个深度选题。`,
    ].join('\n'),
    sourceUrl: meetingDocUrl,
    meetingDocUrl,
    meetingMinutesUrl: meetingNotesUrl,
  });

  const createdDaily = parsed.dailyTopics.map((topic) => create(projectId, userId, {
    kind: 'topic',
    subKind: 'daily',
    title: topic.title || '未命名日常选题',
    body: topic.summary || '',
    ownerText: topic.owner || '待分配',
    progress: topic.progress || 0,
    timelineText: topicTimelineText(topic, false),
    sourceUrl: meetingDocUrl,
    meetingDocUrl,
    meetingMinutesUrl: meetingNotesUrl,
  }));
  const createdDeep = parsed.deepTopics.map((topic) => create(projectId, userId, {
    kind: 'topic',
    subKind: 'deep',
    title: topic.title || '未命名深度选题',
    body: [topic.summary || '', topic.resources ? `资源配合：${topic.resources}` : ''].filter(Boolean).join('\n\n'),
    ownerText: topic.owner || '待分配',
    progress: topic.progress || 0,
    timelineText: topicTimelineText(topic, true),
    sourceUrl: meetingDocUrl,
    meetingDocUrl,
    meetingMinutesUrl: meetingNotesUrl,
  }));

  const boardUrl = `${config.clientUrl}/topics/daily`;
  const notifications = [];
  for (const topic of [...parsed.dailyTopics, ...parsed.deepTopics]) {
    if (!topic.owner) continue;
    notifications.push(await notifyTopicOwner({
      ownerName: topic.owner,
      projectId,
      title: topic.title,
      firstDraftAt: topic.firstDraftAt,
      summary: topic.summary,
      boardUrl,
    }));
  }

  return {
    meeting,
    dailyTopics: createdDaily,
    deepTopics: createdDeep,
    notifications,
    source: {
      meetingDoc: { title: meetingDoc.title, url: meetingDocUrl },
      meetingNotes: { title: meetingNotes.title, url: meetingNotesUrl },
    },
  };
}
