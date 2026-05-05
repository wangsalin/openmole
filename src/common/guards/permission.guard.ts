import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { AuditService } from '../../modules/audit/audit.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      await this.writePermissionDenied(request, required, 'unauthenticated');
      throw new UnauthorizedException();
    }

    if (
      user.roles?.some((role) => role.roleKey === 'platform_super_admin') ||
      user.roles?.some(
        (role) =>
          role.dataScope === 'platform' || role.roleKey.startsWith('platform_'),
      )
    ) {
      return true;
    }

    const roleIds =
      request.tenantContext?.roleIds ??
      user.memberships?.map((membership) => membership.roleId) ??
      [];
    if (!roleIds.length) {
      await this.writePermissionDenied(request, required, 'missing_role_binding');
      throw new ForbiddenException('Missing role binding');
    }

    const grants = await this.prisma.rolePermission.findMany({
      where: { roleId: { in: roleIds } },
      select: { permissionId: true },
    });

    const permissions = await this.prisma.permission.findMany({
      where: {
        id: { in: grants.map((grant) => grant.permissionId) },
        status: 'active',
      },
      select: { permissionKey: true },
    });
    const granted = new Set(
      permissions.map((permission) => permission.permissionKey),
    );

    const allowed = required.every((permission) => granted.has(permission));
    if (!allowed) {
      await this.writePermissionDenied(
        request,
        required,
        'insufficient_permissions',
      );
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  private async writePermissionDenied(
    request: AuthenticatedRequest,
    required: string[],
    reason: string,
  ) {
    try {
      await this.audit.writeSecurityEvent({
        action: 'auth.permission.denied',
        resource: request.originalUrl ?? request.url ?? 'unknown',
        userId: request.user?.sub,
        appId: request.tenantContext?.appId,
        tenantId: request.tenantContext?.tenantId,
        ip: request.ip,
        userAgent: request.get?.('user-agent'),
        requestId: request.requestId,
        after: {
          reason,
          required,
          method: request.method,
        },
      });
    } catch {
      // Authorization decisions must not depend on audit persistence.
    }
  }
}
