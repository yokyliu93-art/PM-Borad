export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (res.status === 401) {
    throw new Error('Unauthorized');
  }
  return readJsonResponse(res);
}

export async function optionalApi(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (res.status === 401) {
    return { ok: false, unauthorized: true };
  }
  return readJsonResponse(res);
}

export function get(path) { return api(path); }
export function getOptional(path) { return optionalApi(path); }
export function post(path, body) { return api(path, { method: 'POST', body: JSON.stringify(body) }); }
export function put(path, body) { return api(path, { method: 'PUT', body: JSON.stringify(body) }); }
export function del(path) { return api(path, { method: 'DELETE' }); }

export async function uploadFile(path, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (res.status === 401) {
    throw new Error('Unauthorized');
  }
  return readJsonResponse(res);
}

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  const text = await res.text().catch(() => '');
  if (text.trim().startsWith('<')) {
    return {
      ok: false,
      error: res.redirected ? '登录状态已失效，请重新飞书授权后再试' : '服务返回了网页而不是数据，请刷新页面后重试',
    };
  }
  return { ok: false, error: text || `请求失败（${res.status}）` };
}
