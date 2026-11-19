const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const SOCKET_URL = BASE || undefined; // undefined -> same origin (Vite proxy in dev)
export const RANK = { member: 1, tenant_admin: 2, org_admin: 3 };
export const ROLE_LABEL = { member: 'Member', tenant_admin: 'Branch admin', org_admin: 'Org admin' };

const KEY = 'livewall_token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || 'Request failed');
    this.status = status;
    this.body = body || {};
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { error: 'You appear to be offline. Your change was not saved.' });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  patch: (p, b = {}) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
};
