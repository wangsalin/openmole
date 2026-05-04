import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  AuthenticatedRequest,
  JwtMembership,
  RequestUser,
  TenantContext,
} from '../types/authenticated-request';

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isPlatformUser(user?: RequestUser) {
  return Boolean(
    user?.roles?.some(
      (role) =>
        role.dataScope === 'platform' || role.roleKey.startsWith('platform_'),
    ),
  );
}

function hasMembership(
  memberships: JwtMembership[],
  appId?: string,
  tenantId?: string | null,
) {
  return memberships.some((membership) => {
    const sameApp = !appId || membership.appId === appId;
    const sameTenant =
      tenantId === undefined ||
      tenantId === null ||
      membership.tenantId === tenantId;
    return sameApp && sameTenant;
  });
}

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      return next.handle();
    }

    const memberships = user.memberships ?? [];
    const headerAppId = firstHeader(request.headers['x-app-id']);
    const headerTenantId = firstHeader(request.headers['x-tenant-id']);
    const platform = isPlatformUser(user);
    const defaultMembership = memberships[0];

    const appId =
      headerAppId ?? user.activeContext?.appId ?? defaultMembership?.appId;
    const tenantId =
      headerTenantId !== undefined
        ? headerTenantId
        : user.activeContext?.tenantId !== undefined
          ? user.activeContext.tenantId
          : defaultMembership?.tenantId;

    if (!platform && !hasMembership(memberships, appId, tenantId)) {
      throw new ForbiddenException('Invalid tenant context');
    }

    const currentMemberships = platform
      ? memberships
      : memberships.filter((membership) => {
          const sameApp = !appId || membership.appId === appId;
          const sameTenant =
            tenantId === undefined ||
            tenantId === null ||
            membership.tenantId === tenantId;
          return sameApp && sameTenant;
        });

    const tenantContext: TenantContext = {
      appId,
      tenantId,
      userId: user.sub,
      isPlatform: platform,
      roleIds: currentMemberships.map((membership) => membership.roleId),
    };

    request.tenantContext = tenantContext;
    return next.handle();
  }
}
