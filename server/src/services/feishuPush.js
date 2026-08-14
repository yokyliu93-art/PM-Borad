import { config } from '../config.js';

const BASE = 'https://open.feishu.cn/open-apis';

class FeishuPushError extends Error {
  constructor(message) {
    super(message);
    this.userMessage = message;
  }
}

let cachedTenantToken = null;
let cachedTenantTokenExpiresAt = 0;

async function getTenantAccessToken() {
  if (!config.feishuAppId || !config.feishuAppSecret) {
    throw new FeishuPushError('飞书应用未配置，请填写 FEISHU_APP_ID / FEISHU_APP_SECRET');
  }
  const now = Date.now();
  if (cachedTenantToken && cachedTenantTokenExpiresAt - now > 60_000) return cachedTenantToken;
  const res = await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: config.feishuAppId,
      app_secret: config.feishuAppSecret,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0) {
    throw new FeishuPushError(data.msg || '获取飞书 tenant_access_token 失败');
  }
  cachedTenantToken = data.tenant_access_token;
  cachedTenantTokenExpiresAt = now + Number(data.expire || 7200) * 1000;
  return cachedTenantToken;
}

export async function sendTextToChat(chatId, text) {
  const receiveId = String(chatId || '').trim();
  if (!receiveId) throw new FeishuPushError('缺少飞书群 chat_id');
  const token = await getTenantAccessToken();
  const res = await fetch(`${BASE}/im/v1/messages?receive_id_type=chat_id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0) {
    throw new FeishuPushError(data.msg || '飞书消息发送失败，请确认应用已开通 im:message 权限并被加入该群');
  }
  return data.data;
}

async function sendMessage(receiveId, receiveIdType, msgType, content) {
  const cleanReceiveId = String(receiveId || '').trim();
  if (!cleanReceiveId) throw new FeishuPushError('缺少飞书接收人 ID');
  const token = await getTenantAccessToken();
  const res = await fetch(`${BASE}/im/v1/messages?receive_id_type=${receiveIdType}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receive_id: cleanReceiveId,
      msg_type: msgType,
      content: JSON.stringify(content),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0) {
    throw new FeishuPushError(data.msg || '飞书消息发送失败，请确认应用消息权限和可用范围');
  }
  return data.data;
}

export async function sendTextToUser(openId, text) {
  return sendMessage(openId, 'open_id', 'text', { text });
}

export async function sendModuleAssignmentCard({ openId, projectName, moduleName, moduleDetail, assignedByName, actionText, boardUrl }) {
  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'green',
      title: { tag: 'plain_text', content: `PM Board：${actionText || '一级菜单负责人更新'}` },
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: `**项目**：${projectName || ''}` } },
      { tag: 'div', text: { tag: 'lark_md', content: `**一级菜单**：${moduleName || ''}` } },
      moduleDetail ? { tag: 'div', text: { tag: 'lark_md', content: `**说明**：${moduleDetail}` } } : null,
      assignedByName ? { tag: 'div', text: { tag: 'lark_md', content: `**操作人**：${assignedByName}` } } : null,
      boardUrl ? {
        tag: 'action',
        actions: [{
          tag: 'button',
          text: { tag: 'plain_text', content: '打开 PM Board' },
          type: 'primary',
          url: boardUrl,
        }],
      } : null,
    ].filter(Boolean),
  };
  return sendMessage(openId, 'open_id', 'interactive', card);
}

export async function sendLoopReminderCard({ openId, projectName, title, description, promptText, boardUrl }) {
  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: `PM Board 周常：${title || ''}` },
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: `**项目**：${projectName || ''}` } },
      description ? { tag: 'div', text: { tag: 'lark_md', content: `**任务**：${description}` } } : null,
      promptText ? { tag: 'div', text: { tag: 'lark_md', content: promptText } } : null,
      boardUrl ? {
        tag: 'action',
        actions: [{
          tag: 'button',
          text: { tag: 'plain_text', content: '去 PM Board 完成' },
          type: 'primary',
          url: boardUrl,
        }],
      } : null,
    ].filter(Boolean),
  };
  return sendMessage(openId, 'open_id', 'interactive', card);
}
