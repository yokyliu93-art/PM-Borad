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
