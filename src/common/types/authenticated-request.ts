export interface JwtMembership {
  appId: string;
  tenantId?: string | null;
  userId: string;
  roleId: string;
}

export interface JwtRole {
  id: string;
  roleKey: string;
  dataScope?: string;
}

export interface RequestUser {
  sub: string;
  email?: string;
  displayName?: string;
  memberships?: JwtMembership[];
  roles?: JwtRole[];
  activeContext?: {
    appId?: string;
    tenantId?: string | null;
  };
}

export interface TenantContext {
  appId?: string;
  tenantId?: string | null;
  userId?: string;
  isPlatform: boolean;
  roleIds: string[];
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  requestId?: string;
  user?: RequestUser;
  body?: unknown;
  params?: Record<string, string>;
  tenantContext?: TenantContext;
  get?(name: string): string | undefined;
}
