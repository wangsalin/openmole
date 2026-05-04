import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Menu } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {
  AuthenticatedRequest,
  RequestUser,
} from '../../common/types/authenticated-request';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SwitchContextDto } from './dto/switch-context.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, request?: AuthenticatedRequest) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.status !== 'active') {
      await this.writeAuthEvent('auth.login.failed', request, {
        email: dto.email,
        reason: 'user_not_found_or_inactive',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.writeAuthEvent('auth.login.failed', request, {
        email: dto.email,
        userId: user.id,
        reason: 'invalid_password',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const memberships = await this.prisma.tenantMembership.findMany({
      where: { userId: user.id, status: 'active' },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const session = await this.issueSession(user.id, {
      appId: memberships[0]?.appId,
      tenantId: memberships[0]?.tenantId,
    });
    await this.writeAuthEvent('auth.login.succeeded', request, {
      userId: user.id,
      email: user.email,
      appId: session.activeContext?.appId,
      tenantId: session.activeContext?.tenantId,
    });
    return session;
  }

  async contexts(user: RequestUser) {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { userId: user.sub, status: 'active' },
      orderBy: { createdAt: 'asc' },
    });
    const appIds = [...new Set(memberships.map((membership) => membership.appId))];
    const tenantIds = [
      ...new Set(
        memberships
          .map((membership) => membership.tenantId)
          .filter((tenantId): tenantId is string => Boolean(tenantId)),
      ),
    ];
    const [apps, tenants, roles] = await Promise.all([
      this.prisma.app.findMany({ where: { id: { in: appIds } } }),
      this.prisma.tenant.findMany({ where: { id: { in: tenantIds } } }),
      this.prisma.role.findMany({
        where: { id: { in: memberships.map((membership) => membership.roleId) } },
      }),
    ]);

    return memberships.map((membership) => ({
      app: apps.find((app) => app.id === membership.appId),
      tenant: tenants.find((tenant) => tenant.id === membership.tenantId) ?? null,
      role: roles.find((role) => role.id === membership.roleId),
      membership,
    }));
  }

  async menus(user: RequestUser) {
    const platform = user.roles?.some(
      (role) =>
        role.roleKey === 'platform_super_admin' ||
        role.dataScope === 'platform' ||
        role.roleKey.startsWith('platform_'),
    );

    let menus: Menu[];
    if (platform) {
      menus = await this.prisma.menu.findMany({
        where: { status: 'active' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    } else {
      const roleIds = user.memberships?.map((membership) => membership.roleId) ?? [];
      const roleMenus = await this.prisma.roleMenu.findMany({
        where: { roleId: { in: roleIds } },
        select: { menuId: true },
      });
      menus = await this.prisma.menu.findMany({
        where: {
          id: { in: roleMenus.map((roleMenu) => roleMenu.menuId) },
          status: 'active',
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    }

    return this.buildMenuTree(menus);
  }

  async switchContext(
    user: RequestUser,
    dto: SwitchContextDto,
    request?: AuthenticatedRequest,
  ) {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { userId: user.sub, status: 'active' },
    });
    const roles = await this.prisma.role.findMany({
      where: { id: { in: memberships.map((membership) => membership.roleId) } },
    });
    const platform = roles.some(
      (role) => role.dataScope === 'platform' || role.roleKey.startsWith('platform_'),
    );
    const tenantId = dto.tenantId ?? null;
    const app = await this.prisma.app.findUnique({ where: { id: dto.appId } });
    if (!app) {
      await this.writeAuthEvent('auth.switch_context.failed', request, {
        userId: user.sub,
        appId: dto.appId,
        tenantId,
        reason: 'app_not_found',
      });
      throw new BadRequestException('App not found');
    }
    if (tenantId) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: tenantId, appId: dto.appId },
      });
      if (!tenant) {
        await this.writeAuthEvent('auth.switch_context.failed', request, {
          userId: user.sub,
          appId: dto.appId,
          tenantId,
          reason: 'tenant_not_found',
        });
        throw new BadRequestException('Tenant not found');
      }
    }
    const allowed =
      platform ||
      memberships.some(
        (membership) =>
          membership.appId === dto.appId &&
          (tenantId === null || membership.tenantId === tenantId),
      );

    if (!allowed) {
      await this.writeAuthEvent('auth.switch_context.failed', request, {
        userId: user.sub,
        appId: dto.appId,
        tenantId,
        reason: 'outside_memberships',
      });
      throw new ForbiddenException('Context is outside current memberships');
    }

    const session = await this.issueSession(user.sub, {
      appId: dto.appId,
      tenantId,
    });
    await this.writeAuthEvent('auth.switch_context.succeeded', request, {
      userId: user.sub,
      appId: dto.appId,
      tenantId,
    });
    return session;
  }

  private async issueSession(
    userId: string,
    activeContext?: { appId?: string; tenantId?: string | null },
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { userId: user.id, status: 'active' },
      orderBy: { createdAt: 'asc' },
    });
    const roles = await this.prisma.role.findMany({
      where: { id: { in: memberships.map((membership) => membership.roleId) } },
    });
    const payload = {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      memberships,
      roles,
      activeContext,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      memberships,
      roles,
      activeContext,
    };
  }

  private buildMenuTree(menus: Menu[]) {
    const byId = new Map<string, Menu & { children: Menu[] }>();
    for (const menu of menus) {
      byId.set(menu.id, { ...menu, children: [] });
    }

    const roots: Array<Menu & { children: Menu[] }> = [];
    for (const menu of byId.values()) {
      if (menu.parentId && byId.has(menu.parentId)) {
        byId.get(menu.parentId)?.children.push(menu);
      } else {
        roots.push(menu);
      }
    }

    return roots;
  }

  private async writeAuthEvent(
    action: string,
    request: AuthenticatedRequest | undefined,
    detail: {
      userId?: string;
      email?: string | null;
      appId?: string;
      tenantId?: string | null;
      reason?: string;
    },
  ) {
    await this.audit.writeSecurityEvent({
      action,
      resource: 'auth',
      userId: detail.userId,
      appId: detail.appId,
      tenantId: detail.tenantId,
      ip: request?.ip,
      userAgent: request?.get?.('user-agent'),
      after: {
        email: detail.email,
        reason: detail.reason,
      },
    });
  }
}
