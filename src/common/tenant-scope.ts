import { ForbiddenException } from '@nestjs/common';
import { TenantContext } from './types/authenticated-request';

export interface TenantScopedInput {
  appId?: string | null;
  tenantId?: string | null;
}

export function tenantScopedQuery(
  query: TenantScopedInput,
  tenantContext?: TenantContext,
) {
  if (tenantContext?.isPlatform) {
    return {
      appId: query.appId ?? undefined,
      tenantId: query.tenantId ?? undefined,
    };
  }
  if (!tenantContext?.appId) {
    throw new ForbiddenException('Tenant context is required');
  }
  return {
    appId: tenantContext.appId,
    tenantId: tenantContext.tenantId ?? undefined,
  };
}

export function assertTenantScopedAccess(
  entity: TenantScopedInput,
  tenantContext?: TenantContext,
  message = 'Resource is outside tenant context',
) {
  if (tenantContext?.isPlatform) return;
  if (!tenantContext?.appId) {
    throw new ForbiddenException('Tenant context is required');
  }
  if (entity.appId !== tenantContext.appId) {
    throw new ForbiddenException(message);
  }
  if (
    tenantContext.tenantId !== undefined &&
    tenantContext.tenantId !== null &&
    entity.tenantId !== undefined &&
    entity.tenantId !== null &&
    entity.tenantId !== tenantContext.tenantId
  ) {
    throw new ForbiddenException(message);
  }
}

export function requireTenantWriteScope(tenantContext?: TenantContext) {
  if (!tenantContext?.appId || !tenantContext.tenantId) {
    throw new ForbiddenException('Tenant context is required');
  }
  return {
    appId: tenantContext.appId,
    tenantId: tenantContext.tenantId,
  };
}
