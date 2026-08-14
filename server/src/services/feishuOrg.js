import db from '../db/connection.js';
import { config } from '../config.js';

const BASE = 'https://open.feishu.cn/open-apis';

let cachedTenantToken = null;
let cachedTenantTokenExpiresAt = 0;

async function getTenantAccessToken() {
  if (!config.feishuAppId || !config.feishuAppSecret) {
    throw new Error('飞书应用未配置，请填写 FEISHU_APP_ID / FEISHU_APP_SECRET');
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
    throw new Error(data.msg || '获取飞书 tenant_access_token 失败');
  }
  cachedTenantToken = data.tenant_access_token;
  cachedTenantTokenExpiresAt = now + Number(data.expire || 7200) * 1000;
  return cachedTenantToken;
}

async function feishuGet(path) {
  const token = await getTenantAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0) {
    throw new Error(data.msg || `飞书接口调用失败：${path}`);
  }
  return data.data || {};
}

async function getJobLevelName(jobLevelId) {
  if (!jobLevelId) return '';
  try {
    const data = await feishuGet(`/contact/v3/job_levels/${encodeURIComponent(jobLevelId)}`);
    const jobLevel = data.job_level || data;
    return jobLevel.name || jobLevel.i18n_name?.zh_cn || jobLevel.i18n_name?.zh || '';
  } catch (err) {
    console.error('[feishu-org] job level sync failed:', err.message);
    return '';
  }
}

export async function syncUserOrgProfile(openId) {
  const userId = String(openId || '').trim();
  if (!userId) throw new Error('缺少飞书 open_id');
  const data = await feishuGet(`/contact/v3/users/${encodeURIComponent(userId)}?user_id_type=open_id`);
  const user = data.user || data;
  const jobLevelId = String(user.job_level_id || user.job_level?.id || '').trim();
  const jobLevelName = String(user.job_level?.name || await getJobLevelName(jobLevelId) || '').trim();
  const department = Array.isArray(user.department_ids)
    ? user.department_ids.join(',')
    : String(user.department_id || user.department_ids || '').trim();
  const leaderUserId = String(user.leader_user_id || user.leader?.leader_id || '').trim();

  db.prepare(`
    UPDATE users
    SET
      department = COALESCE(NULLIF(?, ''), department),
      job_title = ?,
      job_level_id = ?,
      job_level_name = ?,
      employee_type = ?,
      leader_user_id = ?
    WHERE id = ?
  `).run(
    department,
    String(user.job_title || user.position || '').trim(),
    jobLevelId,
    jobLevelName,
    String(user.employee_type ?? '').trim(),
    leaderUserId,
    userId
  );
  return db.prepare(`
    SELECT id, name, department, job_title, job_level_id, job_level_name, employee_type, leader_user_id
    FROM users
    WHERE id = ?
  `).get(userId);
}
