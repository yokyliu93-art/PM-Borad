import { v4 as uuid } from 'uuid';
import db from '../db/connection.js';
import { config } from '../config.js';
import * as aiService from './ai.js';
import * as feishuService from './feishu.js';
import * as feishuPushService from './feishuPush.js';

const TOPIC_EDITORS = ['王兆洋'];

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
  const lower = value.toLowerCase();
  if (['daily', 'business', 'deep', 'weekly_recommendation', 'frontier', 'prompt'].includes(lower)) return lower;
  if (value.includes('商务')) return 'business';
  if (value.includes('深度')) return 'deep';
  if (/本周项目推荐|项目推荐|weekly/i.test(value)) return 'weekly_recommendation';
  if (/frontier|前沿/i.test(value)) return 'frontier';
  if (/prompt|提示词|提示/i.test(value)) return 'prompt';
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
  let docLinks = {};
  try {
    docLinks = row.doc_links_json ? JSON.parse(row.doc_links_json) : {};
  } catch {
    docLinks = {};
  }
  const voteCount = Number(row.vote_count || 0);
  const threshold = Math.max(1, Math.ceil((totalMembers || 1) / 2));
  return {
    ...row,
    doc_links: docLinks && typeof docLinks === 'object' ? docLinks : {},
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
    WHERE m.project_id = ? AND m.status != 'archived' ${whereKind}
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
    WHERE p.team_id = ? AND m.status != 'archived' ${where.length ? `AND ${where.join(' AND ')}` : ''}
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
      status, owner_text, progress, meeting_doc_url, meeting_minutes_url, final_doc_url,
      draft_doc_url, publish_date, editor_notes, doc_links_json, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    fields.finalDocUrl || fields.final_doc_url || '',
    fields.draftDocUrl || fields.draft_doc_url || '',
    fields.publishDate || fields.publish_date || '',
    fields.editorNotes || fields.editor_notes || '',
    JSON.stringify(fields.docLinks || fields.doc_links || {}),
    userId
  );
  return get(projectId, id, userId);
}

function createOrUpdateParsedTopic(projectId, userId, fields = {}) {
  const title = String(fields.title || '').trim();
  const subKind = normalizeSubKind(fields.subKind || fields.sub_kind);
  const existing = db.prepare(`
    SELECT id
    FROM content_memos
    WHERE project_id = ?
      AND kind = 'topic'
      AND sub_kind = ?
      AND status != 'archived'
      AND LOWER(TRIM(title)) = LOWER(TRIM(?))
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).get(projectId, subKind, title);
  if (!existing) return create(projectId, userId, fields);
  db.prepare(`
    UPDATE content_memos
    SET
      body = ?,
      source_url = ?,
      timeline_text = ?,
      owner_text = ?,
      progress = ?,
      meeting_doc_url = ?,
      meeting_minutes_url = ?,
      updated_at = datetime('now')
    WHERE id = ? AND project_id = ?
  `).run(
    fields.body || '',
    fields.sourceUrl || fields.source_url || '',
    fields.timelineText || fields.timeline_text || '',
    fields.ownerText || fields.owner_text || '',
    Math.min(100, Math.max(0, Math.round(Number(fields.progress || 0)))),
    fields.meetingDocUrl || fields.meeting_doc_url || fields.weeklyDocUrl || fields.weekly_doc_url || '',
    fields.meetingMinutesUrl || fields.meeting_minutes_url || fields.minutesUrl || fields.minutes_url || '',
    existing.id,
    projectId
  );
  return get(projectId, existing.id, userId);
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

export function canEditTopics(userId) {
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  const name = String(user?.name || '').trim();
  if (!name) return false;
  return TOPIC_EDITORS.some((editor) => name === editor || name.includes(editor) || editor.includes(name));
}

function canArchiveTopic(userId, memo) {
  if (memo.created_by === userId) return true;
  const user = db.prepare('SELECT name, job_title FROM users WHERE id = ?').get(userId);
  const name = String(user?.name || '').trim();
  const jobTitle = String(user?.job_title || '').trim();
  const namedEditor = name && TOPIC_EDITORS.some((editor) => name === editor || name.includes(editor) || editor.includes(name));
  return userMatchesOwnerText(user, memo.owner_text) || namedEditor || jobTitle.includes('编辑');
}

function isTopicEditor(userId) {
  return canEditTopics(userId) || String(db.prepare('SELECT job_title FROM users WHERE id = ?').get(userId)?.job_title || '').includes('编辑');
}

function canEditTopic(userId, memo) {
  if (memo.created_by === userId) return true;
  const user = db.prepare('SELECT name, job_title FROM users WHERE id = ?').get(userId);
  return userMatchesOwnerText(user, memo.owner_text) || isTopicEditor(userId);
}

function topicBoardUrl() {
  return `${config.clientUrl}/topics`;
}

function userMatchesOwnerText(user, ownerText = '') {
  const name = String(user?.name || '').trim();
  const owner = String(ownerText || '').trim();
  if (!name || !owner || owner === '待定' || owner === '待分配') return false;
  return owner === name || owner.includes(name) || name.includes(owner);
}

function replaceTopicIntro(body = '', intro = '') {
  const text = String(body || '');
  const nextIntro = String(intro || '').trim();
  const sectionPattern = /##\s*技术介绍\s*\n([\s\S]*?)(?=\n##\s*(?:周计划|阶段性进度|周会讨论纪要|采访原文|稿件框架)\s*\n|$)/;
  if (sectionPattern.test(text)) {
    return text.replace(sectionPattern, `## 技术介绍\n${nextIntro}\n`);
  }
  return nextIntro;
}

function setCurrentProgressText(timelineText = '', currentProgress = '') {
  const progress = String(currentProgress || '').trim();
  const current = String(timelineText || '').trim();
  if (/当前进度[：:]\s*[^\n]*/.test(current)) {
    return progress
      ? current.replace(/当前进度[：:]\s*[^\n]*/, `当前进度：${progress}`)
      : current.replace(/当前进度[：:]\s*[^\n]*\n?/g, '').trim();
  }
  if (!progress) return current;
  return current ? `当前进度：${progress}\n${current}` : `当前进度：${progress}`;
}

export function updateTopicDetails(projectId, memoId, userId, fields = {}) {
  const memo = db.prepare('SELECT id, kind, title, body, timeline_text, created_by, owner_text FROM content_memos WHERE id = ? AND project_id = ?').get(memoId, projectId);
  if (!memo) throw new Error('选题不存在');
  if (memo.kind !== 'topic') throw new Error('只能编辑选题卡片');
  if (!canEditTopic(userId, memo)) throw new Error('只有作者、负责人和编辑可以编辑选题卡片');
  const title = String(fields.title ?? memo.title).trim();
  if (!title) throw new Error('选题名称不能为空');
  const hasBody = Object.prototype.hasOwnProperty.call(fields, 'body') || Object.prototype.hasOwnProperty.call(fields, 'theme');
  const body = hasBody ? replaceTopicIntro(memo.body, fields.body ?? fields.theme ?? '') : memo.body;
  const timelineText = Object.prototype.hasOwnProperty.call(fields, 'currentProgress')
    || Object.prototype.hasOwnProperty.call(fields, 'current_progress')
    ? setCurrentProgressText(memo.timeline_text, fields.currentProgress ?? fields.current_progress ?? '')
    : memo.timeline_text;
  db.prepare(`
    UPDATE content_memos
    SET title = ?, body = ?, timeline_text = ?, updated_at = datetime('now')
    WHERE id = ? AND project_id = ?
  `).run(title, body, timelineText, memoId, projectId);
  return get(projectId, memoId, userId);
}

export function updateTopicFinalDoc(projectId, memoId, userId, fields = {}) {
  const memo = db.prepare('SELECT id, kind, created_by, owner_text FROM content_memos WHERE id = ? AND project_id = ?').get(memoId, projectId);
  if (!memo) throw new Error('选题不存在');
  if (memo.kind !== 'topic') throw new Error('只能编辑选题的飞书稿件链接');
  if (!canEditTopic(userId, memo)) throw new Error('只有作者、负责人和编辑可以填写稿件链接');
  const finalDocUrl = String(fields.finalDocUrl || fields.final_doc_url || '').trim();
  db.prepare(`
    UPDATE content_memos
    SET final_doc_url = ?, updated_at = datetime('now')
    WHERE id = ? AND project_id = ?
  `).run(finalDocUrl, memoId, projectId);
  return get(projectId, memoId, userId);
}

export function updateTopicPublishDate(projectId, memoId, userId, fields = {}) {
  const memo = db.prepare('SELECT id, kind, created_by, owner_text FROM content_memos WHERE id = ? AND project_id = ?').get(memoId, projectId);
  if (!memo) throw new Error('选题不存在');
  if (memo.kind !== 'topic') throw new Error('只能编辑选题发布日期');
  if (!canEditTopic(userId, memo)) throw new Error('只有作者、负责人和编辑可以选择发布日期');
  const publishDate = String(fields.publishDate || fields.publish_date || '').trim();
  db.prepare(`
    UPDATE content_memos
    SET publish_date = ?, updated_at = datetime('now')
    WHERE id = ? AND project_id = ?
  `).run(publishDate, memoId, projectId);
  return get(projectId, memoId, userId);
}

export function updateTopicDraftDate(projectId, memoId, userId, fields = {}) {
  const memo = db.prepare('SELECT id, kind, created_by, owner_text, timeline_text FROM content_memos WHERE id = ? AND project_id = ?').get(memoId, projectId);
  if (!memo) throw new Error('选题不存在');
  if (memo.kind !== 'topic') throw new Error('只能编辑选题交稿日期');
  const user = db.prepare('SELECT name, job_title FROM users WHERE id = ?').get(userId);
  if (memo.created_by !== userId && !userMatchesOwnerText(user, memo.owner_text) && !isTopicEditor(userId)) {
    throw new Error('只有选题负责人和编辑可以填写交稿日期');
  }
  const draftDate = String(fields.draftDate || fields.draft_date || '').trim();
  const current = String(memo.timeline_text || '').trim();
  let timelineText = current;
  if (/交稿日期[：:]\s*[^\n]*/.test(current)) {
    timelineText = draftDate
      ? current.replace(/交稿日期[：:]\s*[^\n]*/, `交稿日期：${draftDate}`)
      : current.replace(/交稿日期[：:]\s*[^\n]*\n?/g, '').trim();
  } else if (draftDate) {
    timelineText = current ? `交稿日期：${draftDate}\n${current}` : `交稿日期：${draftDate}`;
  }
  db.prepare(`
    UPDATE content_memos
    SET timeline_text = ?, updated_at = datetime('now')
    WHERE id = ? AND project_id = ?
  `).run(timelineText, memoId, projectId);
  return get(projectId, memoId, userId);
}

export function updateTopicOwner(projectId, memoId, userId, fields = {}) {
  const memo = db.prepare('SELECT id, kind, created_by, owner_text FROM content_memos WHERE id = ? AND project_id = ?').get(memoId, projectId);
  if (!memo) throw new Error('选题不存在');
  if (memo.kind !== 'topic') throw new Error('只能编辑选题负责人');
  if (!canEditTopic(userId, memo)) throw new Error('只有作者、负责人和编辑可以分配负责人');
  const ownerText = String(fields.ownerText || fields.owner_text || '').trim();
  if (!ownerText) throw new Error('请选择负责人');
  db.prepare(`
    UPDATE content_memos
    SET owner_text = ?, updated_at = datetime('now')
    WHERE id = ? AND project_id = ?
  `).run(ownerText, memoId, projectId);
  return get(projectId, memoId, userId);
}

export function updateTopicDocLinks(projectId, memoId, userId, fields = {}) {
  const memo = db.prepare('SELECT id, kind, created_by, owner_text, doc_links_json FROM content_memos WHERE id = ? AND project_id = ?').get(memoId, projectId);
  if (!memo) throw new Error('选题不存在');
  if (memo.kind !== 'topic') throw new Error('只能编辑选题文档入口');
  const user = db.prepare('SELECT name, job_title FROM users WHERE id = ?').get(userId);
  if (memo.created_by !== userId && !userMatchesOwnerText(user, memo.owner_text) && !isTopicEditor(userId)) {
    throw new Error('只有选题负责人和编辑可以维护文档入口');
  }
  let current = {};
  try {
    current = memo.doc_links_json ? JSON.parse(memo.doc_links_json) : {};
  } catch {
    current = {};
  }
  const incoming = fields.docLinks || fields.doc_links || {};
  const allowedKeys = ['techIntro', 'weeklyPlan', 'phaseProgress', 'interviewRaw', 'outline', 'reference', 'draft'];
  const next = { ...current };
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      next[key] = String(incoming[key] || '').trim();
    }
  }
  db.prepare(`
    UPDATE content_memos
    SET doc_links_json = ?, updated_at = datetime('now')
    WHERE id = ? AND project_id = ?
  `).run(JSON.stringify(next), memoId, projectId);
  return get(projectId, memoId, userId);
}

export function archiveTopic(projectId, memoId, userId) {
  const memo = db.prepare('SELECT id, kind, created_by, owner_text FROM content_memos WHERE id = ? AND project_id = ?').get(memoId, projectId);
  if (!memo) throw new Error('选题不存在');
  if (memo.kind !== 'topic') throw new Error('只能归档选题');
  if (!canArchiveTopic(userId, memo)) throw new Error('只有作者、负责人和编辑可以归档选题');
  db.prepare(`
    UPDATE content_memos
    SET status = 'archived', updated_at = datetime('now')
    WHERE id = ? AND project_id = ?
  `).run(memoId, projectId);
  return { id: memoId, archived: true };
}

export async function submitTopicDraft(projectId, memoId, userId, fields = {}) {
  const memo = db.prepare(`
    SELECT m.*, u.name as created_by_name
    FROM content_memos m
    JOIN users u ON u.id = m.created_by
    WHERE m.id = ? AND m.project_id = ?
  `).get(memoId, projectId);
  if (!memo) throw new Error('选题不存在');
  if (memo.kind !== 'topic') throw new Error('只能提交选题初稿');
  if (!canEditTopic(userId, memo)) throw new Error('只有作者、负责人和编辑可以提交初稿');
  const draftDocUrl = String(fields.draftDocUrl || fields.draft_doc_url || '').trim();
  if (!draftDocUrl) throw new Error('请填写初稿飞书链接');
  db.prepare(`
    UPDATE content_memos
    SET draft_doc_url = ?, updated_at = datetime('now')
    WHERE id = ? AND project_id = ?
  `).run(draftDocUrl, memoId, projectId);

  const editor = findUserByName('王兆洋', projectId);
  let pushed = false;
  let pushError = '';
  if (editor?.id) {
    try {
      await feishuPushService.sendTextToUser(
        editor.id,
        [
          `PM Board 初稿待编辑：${memo.title}`,
          `作者：${memo.owner_text || memo.created_by_name || ''}`,
          `初稿链接：${draftDocUrl}`,
          `打开选题面板：${topicBoardUrl()}`,
        ].filter(Boolean).join('\n')
      );
      pushed = true;
    } catch (err) {
      pushError = err.userMessage || err.message;
    }
  } else {
    pushError = '未找到王兆洋账号';
  }
  return { topic: get(projectId, memoId, userId), pushed, pushError };
}

export async function updateTopicEditorNotes(projectId, memoId, userId, fields = {}) {
  const memo = db.prepare(`
    SELECT m.*, u.name as created_by_name
    FROM content_memos m
    JOIN users u ON u.id = m.created_by
    WHERE m.id = ? AND m.project_id = ?
  `).get(memoId, projectId);
  if (!memo) throw new Error('选题不存在');
  if (memo.kind !== 'topic') throw new Error('只能编辑选题建议');
  if (!canEditTopic(userId, memo)) throw new Error('只有作者、负责人和编辑可以填写编辑建议');
  const editorNotes = String(fields.editorNotes || fields.editor_notes || '').trim();
  if (!editorNotes) throw new Error('请填写编辑建议');
  db.prepare(`
    UPDATE content_memos
    SET editor_notes = ?, updated_at = datetime('now')
    WHERE id = ? AND project_id = ?
  `).run(editorNotes, memoId, projectId);

  let pushed = false;
  let pushError = '';
  const owner = findUserByName(memo.owner_text, projectId);
  const recipientId = owner?.id || memo.created_by;
  if (recipientId) {
    try {
      await feishuPushService.sendTextToUser(
        recipientId,
        [
          `PM Board 编辑建议：${memo.title}`,
          editorNotes,
          memo.draft_doc_url ? `初稿链接：${memo.draft_doc_url}` : '',
          `打开选题面板：${topicBoardUrl()}`,
        ].filter(Boolean).join('\n')
      );
      pushed = true;
    } catch (err) {
      pushError = err.userMessage || err.message;
    }
  }
  return { topic: get(projectId, memoId, userId), pushed, pushError };
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
  const firstDraftAt = String(topic.firstDraftAt || '').trim();
  return firstDraftAt && !/待定|暂无|没有|无/i.test(firstDraftAt) ? `交稿日期：${firstDraftAt}` : '';
}

const TOPIC_LINE_KEYWORDS = /选题|题目|主题|初稿|截稿|稿|文章|报道|采访|约访|试用|体验|Demo|demo|深度|日常|专题|系列|发布|上线|推荐|Builder|GAI|GenAI|下周|本周|时间|进度|排期|timeline|讨论|确定|待定/i;

function topicExcerpt(content = '', limit = 1800) {
  const text = String(content || '').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return '';
  if (text.length <= limit) return text;
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const picked = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (!TOPIC_LINE_KEYWORDS.test(lines[i])) continue;
    for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 2); j += 1) {
      const line = lines[j];
      if (seen.has(line)) continue;
      picked.push(line);
      seen.add(line);
    }
  }
  const relevant = picked.join('\n').slice(0, limit);
  return relevant || text.slice(0, limit);
}

function fallbackWeeklyTopics({ meetingDoc, meetingNotes, aiError }) {
  const docPart = topicExcerpt(meetingDoc?.content || '', 900);
  const notesPart = topicExcerpt(meetingNotes?.content || '', 1800);
  const body = [
    aiError ? `DeepSeek 没有返回可用 JSON，已先回传飞书文档内容，等待人工整理。错误：${aiError}` : '',
    meetingDoc?.title ? `周会文档：${meetingDoc.title}` : '',
    docPart ? `周会文档片段：\n${docPart}` : '',
    meetingNotes?.title ? `周会速记文档：${meetingNotes.title}` : '',
    notesPart ? `速记文档片段：\n${notesPart}` : '',
  ].filter(Boolean).join('\n\n');
  return {
    fallback: true,
    dailyTopics: [{
      title: meetingDoc?.title || meetingNotes?.title || '周会选题待整理',
      owner: '',
      firstDraftAt: '',
      summary: body || '飞书文档已读取，但没有抽取到可展示内容。',
    }],
    deepTopics: [],
  };
}

function topicBodyWithDiscussion(topic, extraLines = []) {
  return [
    topic.summary || '',
    topic.meetingDiscussion ? `## 周会讨论纪要\n${topic.meetingDiscussion}` : '',
    ...extraLines,
  ].filter(Boolean).join('\n\n');
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
  if (!projectId) {
    return db.prepare(`
      SELECT *
      FROM users
      WHERE name = ? OR name LIKE ? OR ? LIKE '%' || name || '%'
      ORDER BY LENGTH(name) DESC
      LIMIT 1
    `).get(clean, `%${clean}%`, clean);
  }
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
        firstDraftAt ? `交稿日期：${firstDraftAt}` : '',
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
  const preview = await previewWeeklyTopics(projectId, userId, fields);
  return confirmWeeklyTopics(projectId, userId, {
    ...fields,
    parsed: preview.parsed,
    source: preview.source,
    fallback: preview.fallback,
    aiError: preview.aiError,
  });
}

export async function previewWeeklyTopics(projectId, userId, fields = {}) {
  const meetingDocUrl = String(fields.meetingDocUrl || fields.meeting_doc_url || '').trim();
  if (!meetingDocUrl) throw new Error('请提供周会文档链接');

  const meetingDoc = await feishuService.fetchDocContent(userId, meetingDocUrl);
  const meetingNotes = { title: '', url: '', content: '' };
  let parsed;
  let aiError = '';
  try {
    parsed = await aiService.parseWeeklyTopics({ meetingDoc, meetingNotes });
    if (!parsed.dailyTopics.length && !parsed.businessTopics?.length && !parsed.deepTopics.length && !parsed.weeklyRecommendations?.length && !parsed.frontierTopics?.length && !parsed.promptTopics?.length) {
      aiError = 'DeepSeek 返回了空选题列表';
      parsed = fallbackWeeklyTopics({ meetingDoc, meetingNotes, aiError });
    }
  } catch (err) {
    aiError = err.userMessage || err.message || 'DeepSeek 解析失败';
    console.error('[content] weekly topics AI fallback:', aiError);
    parsed = fallbackWeeklyTopics({ meetingDoc, meetingNotes, aiError });
  }
  return {
    parsed,
    fallback: !!parsed.fallback,
    aiError,
    source: {
      meetingDoc: { title: meetingDoc.title, url: meetingDocUrl },
    },
  };
}

export async function confirmWeeklyTopics(projectId, userId, fields = {}) {
  const parsed = fields.parsed || {};
  const dailyTopics = parsed.dailyTopics || [];
  const businessTopics = parsed.businessTopics || [];
  const deepTopics = parsed.deepTopics || [];
  const weeklyRecommendations = parsed.weeklyRecommendations || [];
  const frontierTopics = parsed.frontierTopics || [];
  const promptTopics = parsed.promptTopics || [];
  const meetingDocUrl = String(fields.meetingDocUrl || fields.meeting_doc_url || fields.source?.meetingDoc?.url || '').trim();
  const meetingDocTitle = String(fields.source?.meetingDoc?.title || fields.title || '周会选题解析').trim();
  const meeting = create(projectId, userId, {
    kind: 'meeting',
    title: fields.title || meetingDocTitle || '周会选题解析',
    body: [
      `周会文档：${meetingDocTitle || meetingDocUrl}`,
      parsed.fallback
        ? `DeepSeek 解析失败，已先回传飞书文档内容，生成 ${dailyTopics.length} 个待整理选题。`
        : `DeepSeek 已解析出 ${dailyTopics.length} 个日常选题、${businessTopics.length} 个商务选题、${deepTopics.length} 个深度选题、${weeklyRecommendations.length} 个本周项目推荐、${frontierTopics.length} 个 Frontier、${promptTopics.length} 个 Prompt PR。`,
    ].filter(Boolean).join('\n'),
    sourceUrl: meetingDocUrl,
    meetingDocUrl,
    meetingMinutesUrl: '',
  });

  const createdDaily = dailyTopics.map((topic) => createOrUpdateParsedTopic(projectId, userId, {
    kind: 'topic',
    subKind: 'daily',
    title: topic.title || '未命名日常选题',
    body: topicBodyWithDiscussion(topic),
    ownerText: topic.owner || '待分配',
    progress: topic.progress || 0,
    timelineText: topicTimelineText(topic, false),
    sourceUrl: meetingDocUrl,
    meetingDocUrl,
    meetingMinutesUrl: '',
  }));
  const createdBusiness = businessTopics.map((topic) => createOrUpdateParsedTopic(projectId, userId, {
    kind: 'topic',
    subKind: 'business',
    title: topic.title || '未命名商务选题',
    body: topicBodyWithDiscussion(topic),
    ownerText: topic.owner || '待分配',
    progress: topic.progress || 0,
    timelineText: topicTimelineText(topic, false),
    sourceUrl: meetingDocUrl,
    meetingDocUrl,
    meetingMinutesUrl: '',
  }));
  const createdDeep = deepTopics.map((topic) => createOrUpdateParsedTopic(projectId, userId, {
    kind: 'topic',
    subKind: 'deep',
    title: topic.title || '未命名深度选题',
    body: topicBodyWithDiscussion(topic, [topic.resources ? `资源配合：${topic.resources}` : '']),
    ownerText: topic.owner || '待分配',
    progress: topic.progress || 0,
    timelineText: topicTimelineText(topic, true),
    sourceUrl: meetingDocUrl,
    meetingDocUrl,
    meetingMinutesUrl: '',
  }));
  const createdWeekly = weeklyRecommendations.map((topic) => createOrUpdateParsedTopic(projectId, userId, {
    kind: 'topic',
    subKind: 'weekly_recommendation',
    title: topic.title || '未命名本周项目推荐',
    body: topicBodyWithDiscussion(topic),
    ownerText: topic.owner || '待分配',
    progress: topic.progress || 0,
    timelineText: topicTimelineText(topic, false),
    sourceUrl: meetingDocUrl,
    meetingDocUrl,
    meetingMinutesUrl: '',
  }));
  const createdFrontier = frontierTopics.map((topic) => createOrUpdateParsedTopic(projectId, userId, {
    kind: 'topic',
    subKind: 'frontier',
    title: topic.title || '未命名 Frontier',
    body: [
      topic.summary || '',
      topic.reason ? `为什么关注：${topic.reason}` : '',
      topic.resources ? `资料 / 下一步：${topic.resources}` : '',
    ].filter(Boolean).join('\n\n'),
    ownerText: topic.owner || '待分配',
    progress: topic.progress || 0,
    timelineText: topicTimelineText(topic, false),
    sourceUrl: meetingDocUrl,
    meetingDocUrl,
    meetingMinutesUrl: '',
  }));
  const createdPrompt = promptTopics.map((topic) => createOrUpdateParsedTopic(projectId, userId, {
    kind: 'topic',
    subKind: 'prompt',
    title: topic.title || '未命名 Prompt PR',
    body: topic.summary || '',
    ownerText: topic.owner || '待分配',
    progress: topic.progress || 0,
    timelineText: topicTimelineText(topic, false),
    sourceUrl: meetingDocUrl,
    meetingDocUrl,
    meetingMinutesUrl: '',
  }));

  const boardUrl = `${config.clientUrl}/topics/daily`;
  const notifications = [];
  for (const topic of [...dailyTopics, ...businessTopics, ...deepTopics, ...weeklyRecommendations, ...frontierTopics, ...promptTopics]) {
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
    businessTopics: createdBusiness,
    deepTopics: createdDeep,
    weeklyRecommendations: createdWeekly,
    frontierTopics: createdFrontier,
    promptTopics: createdPrompt,
    notifications,
    fallback: !!parsed.fallback,
    aiError,
    source: {
      meetingDoc: { title: meetingDocTitle, url: meetingDocUrl },
    },
  };
}

export async function parseTopicDiscussions(projectId, userId, fields = {}) {
  const meetingNotesUrl = String(fields.meetingNotesUrl || fields.meeting_notes_url || fields.meetingMinutesUrl || fields.meeting_minutes_url || '').trim();
  const transcript = String(fields.transcript || '').trim();
  if (!meetingNotesUrl && !transcript) throw new Error('请提供周会速记文档链接或粘贴速记文字');
  const totalMembers = teamSize(projectId);
  const topics = db.prepare(`
    SELECT *
    FROM content_memos
    WHERE project_id = ? AND kind = 'topic' AND status != 'archived'
    ORDER BY updated_at DESC, created_at DESC
  `).all(projectId).map((row) => hydrateMemo(row, totalMembers));
  if (!topics.length) throw new Error('还没有已确认选题，请先解析周会文档并确认入库');
  const meetingNotes = meetingNotesUrl
    ? await feishuService.fetchDocContent(userId, meetingNotesUrl)
    : { title: fields.title || '粘贴的周会速记', url: '', content: transcript };
  const parsed = await aiService.parseTopicDiscussions({ topics, meetingNotes });
  const updates = [];
  const updateStmt = db.prepare(`
    UPDATE content_memos
    SET editor_notes = ?, meeting_minutes_url = ?, updated_at = datetime('now')
    WHERE id = ? AND project_id = ? AND kind = 'topic'
  `);
  for (const item of parsed.discussions) {
    const topic = topics.find((candidate) => candidate.id === item.topicId);
    if (!topic) continue;
    const editorNotes = [
      item.discussion ? `周会讨论：\n${item.discussion}` : '',
      item.editorNotes ? `编辑意见：\n${item.editorNotes}` : '',
    ].filter(Boolean).join('\n\n');
    updateStmt.run(editorNotes, meetingNotesUrl, topic.id, projectId);
    updates.push(get(projectId, topic.id, userId));
  }
  return {
    updatedTopics: updates,
    discussions: parsed.discussions,
    source: { title: meetingNotes.title, url: meetingNotesUrl },
  };
}
