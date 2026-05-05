import { ApiErrorBody, AuthSession, ContextOption, MenuItem } from './types';

const TOKEN_KEY = 'openmole.admin.token';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const API_BASE_CANDIDATES = API_BASE_URL
  ? [API_BASE_URL]
  : import.meta.env.DEV
    ? ['']
    : ['http://localhost:3000', 'http://localhost:3200', ''];

export class ApiError extends Error {
  status: number;
  body?: ApiErrorBody;

  constructor(status: number, body?: ApiErrorBody) {
    super(body?.message ?? `请求失败，状态码 ${status}`);
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

  let response: Response | undefined;
  let body: ApiErrorBody | T | undefined;
  let lastError: unknown;

  for (const baseUrl of API_BASE_CANDIDATES) {
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers,
      });
      const requestId = response.headers.get('x-request-id') ?? undefined;
      body = await response
        .json()
        .catch(() => ({ requestId, message: response?.statusText }));

      if (response.ok || response.status !== 404 || API_BASE_URL) break;
    } catch (error) {
      lastError = error;
      if (API_BASE_URL) break;
    }
  }

  if (!response) {
    throw new ApiError(0, {
      code: 'NETWORK_ERROR',
      message: lastError instanceof Error ? lastError.message : 'Network error',
    });
  }
  const requestId = response.headers.get('x-request-id') ?? undefined;

  if (!response.ok) {
    throw new ApiError(response.status, { requestId, ...(body as ApiErrorBody) });
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

export function createResource<T>(
  path: string,
  payload: Record<string, unknown>,
  context?: { appId?: string; tenantId?: string | null },
) {
  return apiRequest<T>(path, {
    method: 'POST',
    body: JSON.stringify(payload),
    context,
  });
}

export function updateResource<T>(
  path: string,
  payload: Record<string, unknown>,
  context?: { appId?: string; tenantId?: string | null },
) {
  return apiRequest<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    context,
  });
}

export function runResourceAction<T>(
  path: string,
  context?: { appId?: string; tenantId?: string | null },
) {
  return apiRequest<T>(path, {
    method: 'POST',
    context,
  });
}

export function getDashboard(context?: { appId?: string; tenantId?: string | null }) {
  return apiRequest<Record<string, number>>('/admin/v1/dashboard/summary', { context });
}
