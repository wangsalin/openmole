export interface ApiErrorBody {
  requestId?: string;
  code?: string;
  message?: string;
  details?: unknown;
  statusCode?: number;
  path?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName?: string | null;
}

export interface SessionRole {
  id: string;
  roleKey: string;
  name?: string;
  dataScope?: string;
}

export interface ActiveContext {
  appId?: string;
  tenantId?: string | null;
}

export interface AuthSession {
  accessToken: string;
  user: SessionUser;
  roles: SessionRole[];
  activeContext?: ActiveContext;
}

export interface ContextOption {
  app?: { id: string; name: string; appKey?: string };
  tenant?: { id: string; name: string } | null;
  role?: { id: string; name: string; roleKey: string };
  membership: {
    appId: string;
    tenantId?: string | null;
    roleId: string;
  };
}

export interface MenuItem {
  id: string;
  title?: string;
  name?: string;
  path?: string | null;
  icon?: string | null;
  children?: MenuItem[];
}
