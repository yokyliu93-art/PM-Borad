import { v4 as uuid } from 'uuid';
import { config } from '../config.js';
import db from '../db/connection.js';
import { saveUserTokens } from './auth.js';

const BASE = 'https://open.feishu.cn/open-apis';

class FeishuError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.userMessage = message;
  }
}

function isConfigured() {
  if (config.feishuAppId && config.feishuAppSecret) return true;
  throw new FeishuError('NOT_CONFIGURED', '飞书应用未配置，请在 server/.env 填写 FEISHU_APP_ID / FEISHU_APP_SECRET');
}

// Feishu error codes that mean the user token is gone or unusable.
const AUTH_ERROR_CODES = new Set(['99991661', '99991663', '99991668', '99991671', '99991672']);

async function feishuRequest(path, { token, method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new FeishuError('NETWORK', '无法连接飞书服务，请检查网络');
  }
  const data = await res.json().catch(() => ({}));
  if (data.code !== undefined && data.code !== 0) {
    if (AUTH_ERROR_CODES.has(String(data.code))) {
      throw new FeishuError('NOT_BOUND', '飞书授权已失效，请重新登录授权');
    }
    throw new FeishuError('FEISHU_API', data.msg || `飞书接口错误（${data.code}）`);
  }
  return data;
}

async function refreshAccessToken(userId, refreshToken) {
  const data = await feishuRequest('/authen/v1/refresh_access_token', {
    method: 'POST',
    body: {
      app_id: config.feishuAppId,
      app_secret: config.feishuAppSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    },
  });
  saveUserTokens(userId, {
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    expiresIn: data.data.expires_in,
  });
  return data.data.access_token;
}

// Return a usable user_access_token, refreshing before expiry when possible.
export async function getUserAccessToken(userId) {
  isConfigured();
  const row = db.prepare('SELECT * FROM user_feishu_tokens WHERE user_id = ?').get(userId);
  if (!row) throw new FeishuError('NOT_BOUND', '该账号未绑定飞书，请先通过飞书授权登录');
  if (row.token_expires_at && Date.now() > row.token_expires_at - 60000) {
    if (!row.refresh_token) throw new FeishuError('NOT_BOUND', '飞书授权已过期，请重新登录授权');
    return refreshAccessToken(userId, row.refresh_token);
  }
  return row.access_token;
}

// Extract the doc token + type from a Feishu doc URL.
// Supports 新版云文档 /docx/<token>, 知识库 /wiki/<token>, 旧版 /docs/<token>, 妙记 /minutes/<token>.
export function parseDocUrl(url) {
  let u;
  try {
    u = new URL(String(url).trim());
  } catch {
    return null;
  }
  const match = u.pathname.match(/^\/(docx|wiki|docs|minutes)\/([A-Za-z0-9_-]+)/);
  if (!match) return null;
  return { type: match[1], token: match[2], url: u.toString() };
}

// Fetch a docx document's title and convert its blocks to Markdown.
async function fetchDocx(userId, documentId, url, fallbackTitle = '') {
  const token = await getUserAccessToken(userId);
  let title = fallbackTitle;
  if (!title) {
    try {
      const meta = await feishuRequest('/drive/v1/metas/batch_query', {
        token,
        method: 'POST',
        body: { request_docs: [{ doc_token: documentId, doc_type: 'docx' }] },
      });
      title = meta.data?.metas?.[0]?.title || '';
    } catch { /* title is cosmetic; fall through */ }
  }
  const blocks = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ page_size: '500' });
    if (pageToken) q.set('page_token', pageToken);
    const res = await feishuRequest(`/docx/v1/documents/${documentId}/blocks?${q}`, { token });
    blocks.push(...(res.data?.items || []));
    pageToken = res.data?.has_more ? res.data.page_token : '';
  } while (pageToken);
  return {
    title: title || '未命名文档',
    docToken: documentId,
    docType: 'docx',
    url,
    content: blocksToMarkdown(blocks),
  };
}

// Wiki nodes can point to an uploaded file (obj_type "file"). Download it; if
// it's a text/markdown file, return its content directly so it can be used as
// the project plan. Binary types (PDF, images, ...) are rejected with a clear
// message instead of the generic "file 类型不支持".
const TEXT_FILE_RE = /\.(md|markdown|txt|json|csv|yaml|yml|log)(\?|$)/i;

async function fetchFileContent(userId, fileToken, url, fallbackTitle = '') {
  const token = await getUserAccessToken(userId);
  let res;
  try {
    res = await fetch(`${BASE}/drive/v1/files/${fileToken}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new FeishuError('NETWORK', '无法连接飞书服务，请检查网络');
  }
  if (!res.ok) {
    throw new FeishuError('FEISHU_API', `文件下载失败（${res.status}），请确认你有该文件访问权限`);
  }
  const ctype = res.headers.get('content-type') || '';
  const disp = res.headers.get('content-disposition') || '';
  const star = disp.match(/filename\*=UTF-8''([^;]+)/i);
  const plain = disp.match(/filename="([^"]+)"/i);
  let name = (star && star[1]) || (plain && plain[1]) || '';
  try { name = decodeURIComponent(name); } catch {}
  const isText = /^text\//i.test(ctype) || /markdown|json|xml|javascript/i.test(ctype) || TEXT_FILE_RE.test(name);
  if (!isText) {
    throw new FeishuError('UNSUPPORTED_TYPE', `暂不支持导入「${name || ctype || '未知文件'}」，请上传 .md / .txt 文本文件，或使用新版云文档`);
  }
  const content = Buffer.from(await res.arrayBuffer()).toString('utf8');
  if (!content.trim()) throw new FeishuError('EMPTY', '文件内容为空');
  return {
    title: fallbackTitle || '未命名文件',
    docToken: fileToken,
    docType: 'file',
    url,
    content,
  };
}

// Resolve a wiki node URL to its underlying doc and fetch it.
export async function fetchDocContent(userId, url) {
  const parsed = parseDocUrl(url);
  if (!parsed) throw new FeishuError('BAD_URL', '无法识别的飞书链接，请粘贴 /docx/、/wiki/ 或 /minutes/ 链接');

  if (parsed.type === 'wiki') {
    const token = await getUserAccessToken(userId);
    const nodeRes = await feishuRequest(`/wiki/v2/spaces/get_node?token=${parsed.token}`, { token });
    const node = nodeRes.data?.node;
    if (!node) throw new FeishuError('DOC_NOT_FOUND', '无法读取知识库节点，请确认文档存在且你有访问权限');
    if (node.obj_type === 'docx') {
      return fetchDocx(userId, node.obj_token, url, node.title);
    }
    if (node.obj_type === 'file') {
      return fetchFileContent(userId, node.obj_token, url, node.title);
    }
    throw new FeishuError('UNSUPPORTED_TYPE', `暂不支持导入「${node.obj_type}」类型，请使用新版云文档（docx）`);
  }
  if (parsed.type === 'docx') {
    return fetchDocx(userId, parsed.token, url);
  }
  if (parsed.type === 'minutes') {
    return fetchMinuteTranscript(userId, parsed.token, url);
  }
  throw new FeishuError('UNSUPPORTED_TYPE', '旧版云文档暂不支持导入，请在飞书中转存为新版文档（docx）或使用知识库文档');
}

function transcriptToMarkdown(data) {
  const items = data?.data?.items || data?.data?.transcripts || data?.data?.transcript || data?.items || [];
  if (Array.isArray(items)) {
    return items.map((item) => {
      const speaker = item.speaker_name || item.speaker?.name || item.user_name || item.name || '';
      const text = item.text || item.content || item.sentence || item.paragraph || '';
      return [speaker, text].filter(Boolean).join('：');
    }).filter(Boolean).join('\n');
  }
  if (typeof items === 'string') return items;
  return JSON.stringify(data?.data || data || {}, null, 2);
}

async function fetchMinuteTranscript(userId, minuteToken, url) {
  const token = await getUserAccessToken(userId);
  let title = '飞书妙记';
  try {
    const info = await feishuRequest(`/minutes/v1/minutes/${minuteToken}`, { token });
    title = info.data?.title || info.data?.minute?.title || title;
  } catch { /* transcript may still be readable; title is cosmetic */ }
  const data = await feishuRequest(`/minutes/v1/minutes/${minuteToken}/transcript`, { token });
  const content = transcriptToMarkdown(data);
  if (!content.trim()) throw new FeishuError('EMPTY', '妙记转写内容为空或暂未生成');
  return {
    title,
    docToken: minuteToken,
    docType: 'minutes',
    url,
    content,
  };
}

// Persist an imported doc against a project.
export function saveDoc({ projectId, url, docToken, docType, title, content, userId }) {
  const id = uuid();
  db.prepare(`
    INSERT INTO feishu_docs (id, project_id, doc_token, doc_type, title, url, content_markdown, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId || null, docToken, docType || 'docx', title || '', url || '', content || '', userId);
  return db.prepare('SELECT * FROM feishu_docs WHERE id = ?').get(id);
}

export function listDocs(projectId) {
  return db.prepare('SELECT * FROM feishu_docs WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
}

export function getDoc(id) {
  return db.prepare('SELECT * FROM feishu_docs WHERE id = ?').get(id);
}

export function removeDoc(id) {
  db.prepare('DELETE FROM feishu_docs WHERE id = ?').run(id);
}

function inlineText(elements) {
  if (!Array.isArray(elements)) return '';
  return elements.map((el) => {
    if (el.text_run) {
      const style = el.text_run.text_element_style || {};
      const text = el.text_run.content || '';
      const href = style.link?.url;
      return href ? `[${text}](${href})` : text;
    }
    if (el.mention_doc) return el.mention_doc.title ? `[${el.mention_doc.title}]` : '';
    if (el.mention_user) return el.mention_user.name ? `@${el.mention_user.name}` : '';
    if (el.image) return `![${el.image.title || '图片'}]`;
    return '';
  }).join('');
}

// Feishu blocks carry their content in a per-type field keyed by name (text,
// heading2, bullet, ...) while block_type is an integer enum, so detect the
// content field by key instead of mapping numbers.
const BLOCK_FIELDS = [
  'text', 'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
  'bullet', 'ordered', 'code', 'quote', 'todo', 'callout', 'divider',
  'file', 'image', 'link_to_web',
];

function blocksToMarkdown(blocks) {
  const lines = [];
  for (const b of blocks) {
    const key = BLOCK_FIELDS.find((k) => b[k] !== undefined);
    if (!key) continue; // page / containers / unsupported types
    const data = b[key];
    const text = inlineText(data?.elements);
    if (/^heading[1-6]$/.test(key)) {
      lines.push(`${'#'.repeat(Number(key.slice(7)) || 1)} ${text}`);
    } else if (key === 'text') {
      lines.push(text);
    } else if (key === 'bullet') {
      lines.push(`- ${text}`);
    } else if (key === 'ordered') {
      lines.push(`1. ${text}`);
    } else if (key === 'todo') {
      const done = data?.style?.done ? '[x]' : '[ ]';
      lines.push(`- ${done} ${text}`);
    } else if (key === 'quote') {
      lines.push(`> ${text}`);
    } else if (key === 'callout') {
      lines.push(`> **提示** ${text}`);
    } else if (key === 'code') {
      lines.push('```');
      lines.push(text);
      lines.push('```');
    } else if (key === 'divider') {
      lines.push('---');
    } else if (key === 'image') {
      lines.push(`![${data?.title || '图片'}]`);
    } else if (key === 'file') {
      lines.push(`[文件：${data?.name || ''}]`);
    } else if (key === 'link_to_web') {
      const link = data?.url || '';
      if (link) lines.push(`[外部链接](${link})`);
    }
  }
  return lines.filter((l) => l.trim() !== '').join('\n');
}
