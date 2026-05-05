import { ApiErrorBody, AuthSession, ContextOption, MenuItem } from './types';

const TOKEN_KEY = 'openmole.admin.token';

export class ApiError extends Error {
  status: number;
  body?: ApiErrorBody;

  constructor(status: number, body?: ApiErrorBody) {
    super(body?.message ?? `Request failed with ${status}`);
    this.status = status;
    this.body = body;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string; context?: { appId?: string; tenantId?: string | null } } = {},
) {
  const token = options.token ?? getToken();
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  headers.set('x-request-id', crypto.randomUUID());
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (options.context?.appId) headers.set('x-app-id', options.context.appId);
  if (options.context?.tenantId) headers.set('x-tenant-id', options.context.tenantId);

  const response = await fetch(path, {
    ...options,
    headers,
  });
  const requestId = response.headers.get('x-request-id') ?? undefined;
  const body = await response
    .json()
    .catch(() => ({ requestId, message: response.statusText }));

  if (!response.ok) {
    throw new ApiError(response.status, { requestId, ...body });
  }
  return body as T;
}

export function login(email: string, password: string) {
  return apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function loadContexts() {
  return apiRequest<ContextOption[]>('/auth/contexts');
}

export function loadMenus() {
  return apiRequest<MenuItem[]>('/auth/menus');
}

export function logout() {
  return apiRequest<{ ok: boolean }>('/auth/logout', { method: 'POST' });
}

export function listResource<T>(path: string, context?: { appId?: string; tenantId?: string | null }) {
  return apiRequest<T[]>(path, { context });
}

export function getDashboard(context?: { appId?: string; tenantId?: string | null }) {
  return apiRequest<Record<string, number>>('/admin/v1/dashboard/summary', { context });
}
