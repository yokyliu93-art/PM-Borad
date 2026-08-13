export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (res.status === 401) {
    throw new Error('Unauthorized');
  }
  return res.json();
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
  return res.json();
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
  return res.json();
}
