import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role, TenantMembership } from '@prisma/client';
import { buildPagination, omitUndefined } from '../../common/prisma-list';
import { TenantContext } from '../../common/types/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddTenantMemberDto,
  CreateTenantDto,
  ListTenantMembersDto,
  ListTenantsDto,
  UpdateTenantMemberDto,
  UpdateTenantDto,
} from './dto/tenant.dto';

const TENANT_ROLE_TEMPLATES = [
  {
    roleKey: 'tenant_owner',
    name: 'Tenant Owner',
    dataScope: 'tenant',
    permissions: [
      'tenant.read',
      'tenant.update',
      'tenant.member.read',
      'tenant.member.create',
      'tenant.member.update',
      'tenant.member.disable',
      'identity.user.read',
      'permission.role.read',
      'billing.plan.read',
      'billing.subscription.read',
      'billing.order.read',
      'billing.order.create',
      'billing.order.pay',
      'usage.ledger.read',
      'usage.quota.read',
      'usage.entitlement.check',
      'ai.prompt.read',
      'ai.prompt.create',
      'ai.prompt.version.create',
      'ai.prompt.publish',
      'developer.api_key.read',
      'developer.api_key.create',
      'developer.api_key.disable',
      'developer.webhook.read',
      'developer.webhook.create',
      'developer.webhook.delivery.read',
      'developer.webhook.delivery.retry',
      'knowledge.base.read',
      'knowledge.base.create',
      'knowledge.file.upload',
      'knowledge.index.rebuild',
      'system.setting.read',
    ],
  },
  {
    roleKey: 'tenant_admin',
    name: 'Tenant Admin',
    dataScope: 'tenant',
    permissions: [
      'tenant.read',
      'tenant.member.read',
      'tenant.member.create',
      'tenant.member.update',
      'identity.user.read',
      'permission.role.read',
      'billing.plan.read',
      'billing.subscription.read',
      'billing.order.read',
      'billing.order.create',
      'billing.order.pay',
      'usage.quota.read',
      'usage.entitlement.check',
      'ai.prompt.read',
      'ai.prompt.create',
      'ai.prompt.version.create',
      'ai.prompt.publish',
      'developer.api_key.read',
      'developer.webhook.read',
      'developer.webhook.delivery.read',
      'developer.webhook.delivery.retry',
      'knowledge.base.read',
      'knowledge.file.upload',
    ],
  },
  {
    roleKey: 'tenant_member',
    name: 'Tenant Member',
    dataScope: 'own',
    permissions: ['tenant.read'],
  },
  {
    roleKey: 'readonly',
    name: 'Read Only',
    dataScope: 'tenant',
    permissions: ['tenant.read', 'tenant.member.read'],
  },
];

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: ListTenantsDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    return this.prisma.tenant.findMany({
      where: omitUndefined({
        appId: tenantContext?.isPlatform
          ? query.appId
          : tenantContext?.appId ?? query.appId,
        id:
          !tenantContext?.isPlatform && tenantContext?.tenantId
            ? tenantContext.tenantId
            : undefined,
        status: query.status,
      }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(body: CreateTenantDto, tenantContext?: TenantContext) {
    const { initializeRoles, owner, ...tenantInput } = body;
    const data = {
      ...tenantInput,
      appId: tenantContext?.isPlatform ? body.appId : tenantContext?.appId,
    };
    const tenant = await this.prisma.tenant.create({ data: data as never });
    const roles =
      initializeRoles === false
        ? []
        : await this.initializeRoles(tenant.id, tenantContext);

    let ownerMembership: TenantMembership | null = null;
    if (owner) {
      const ownerRole =
        roles.find((role) => role.roleKey === 'tenant_owner') ??
        (await this.prisma.role.findFirst({
          where: {
            appId: tenant.appId,
            tenantId: tenant.id,
            roleKey: 'tenant_owner',
          },
        }));
      if (!ownerRole) {
        throw new BadRequestException('Tenant owner role was not initialized');
      }
      ownerMembership = await this.addMember(
        tenant.id,
        { ...owner, roleId: ownerRole.id },
        tenantContext,
      );
    }

    return { tenant, roles, ownerMembership };
  }

  async get(id: string, tenantContext?: TenantContext) {
    this.assertTenantAccess(id, tenantContext);
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  update(
    id: string,
    body: UpdateTenantDto | { status: 'active' | 'disabled' },
    tenantContext?: TenantContext,
  ) {
    this.assertTenantAccess(id, tenantContext);
    const { initializeRoles: _initializeRoles, owner: _owner, ...data } =
      body as UpdateTenantDto;
    return this.prisma.tenant.update({ where: { id }, data: data as never });
  }

  async roles(tenantId: string, tenantContext?: TenantContext) {
    this.assertTenantAccess(tenantId, tenantContext);
    const tenant = await this.findTenantOrThrow(tenantId);
    return this.prisma.role.findMany({
      where: {
        appId: tenant.appId,
        OR: [{ tenantId }, { tenantId: null, roleKey: { startsWith: 'tenant_' } }],
        status: 'active',
      },
      orderBy: [{ isBuiltin: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async initializeRoles(tenantId: string, tenantContext?: TenantContext) {
    this.assertTenantAccess(tenantId, tenantContext);
    const tenant = await this.findTenantOrThrow(tenantId);
    const createdRoles: Role[] = [];

    for (const template of TENANT_ROLE_TEMPLATES) {
      const existing = await this.prisma.role.findFirst({
        where: {
          appId: tenant.appId,
          tenantId,
          roleKey: template.roleKey,
        },
      });
      const role =
        existing ??
        (await this.prisma.role.create({
          data: {
            appId: tenant.appId,
            tenantId,
            roleKey: template.roleKey,
            name: template.name,
            dataScope: template.dataScope,
            isBuiltin: true,
            status: 'active',
          },
        }));

      const permissions = await this.prisma.permission.findMany({
        where: { permissionKey: { in: template.permissions } },
      });
      await this.prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });

      createdRoles.push(role);
    }

    return createdRoles;
  }

  async members(
    tenantId: string,
    query: ListTenantMembersDto,
    tenantContext?: TenantContext,
  ) {
    this.assertTenantAccess(tenantId, tenantContext);
    const tenant = await this.findTenantOrThrow(tenantId);
    const { skip, take } = buildPagination(query);
    const memberships = await this.prisma.tenantMembership.findMany({
      where: omitUndefined({
        appId: tenant.appId,
        tenantId,
        status: query.status,
      }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: memberships.map((membership) => membership.userId) } },
      select: {
        id: true,
        email: true,
        phone: true,
        displayName: true,
        avatarUrl: true,
        status: true,
      },
    });
    const roles = await this.prisma.role.findMany({
      where: { id: { in: memberships.map((membership) => membership.roleId) } },
    });

    return memberships.map((membership) => ({
      ...membership,
      user: users.find((user) => user.id === membership.userId),
      role: roles.find((role) => role.id === membership.roleId),
    }));
  }

  async addMember(
    tenantId: string,
    body: AddTenantMemberDto,
    tenantContext?: TenantContext,
  ) {
    this.assertTenantAccess(tenantId, tenantContext);
    const tenant = await this.findTenantOrThrow(tenantId);
    const role = await this.prisma.role.findUnique({ where: { id: body.roleId } });
    if (!role) throw new BadRequestException('Role not found');
    if (role.appId && role.appId !== tenant.appId) {
      throw new BadRequestException('Role belongs to another app');
    }
    if (role.tenantId && role.tenantId !== tenantId) {
      throw new BadRequestException('Role belongs to another tenant');
    }

    const userId = await this.resolveMemberUser(body);
    const membership = await this.prisma.tenantMembership.upsert({
      where: {
        appId_tenantId_userId_roleId: {
          appId: tenant.appId,
          tenantId,
          userId,
          roleId: body.roleId,
        },
      },
      update: { status: 'active' },
      create: {
        appId: tenant.appId,
        tenantId,
        userId,
        roleId: body.roleId,
        status: 'active',
      },
    });

    return membership;
  }

  async updateMember(
    tenantId: string,
    membershipId: string,
    body: UpdateTenantMemberDto,
    tenantContext?: TenantContext,
  ) {
    this.assertTenantAccess(tenantId, tenantContext);
    const tenant = await this.findTenantOrThrow(tenantId);
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { id: membershipId },
    });
    if (!membership || membership.tenantId !== tenantId) {
      throw new NotFoundException('Tenant member not found');
    }

    if (body.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: body.roleId } });
      if (!role) throw new BadRequestException('Role not found');
      if (role.appId && role.appId !== tenant.appId) {
        throw new BadRequestException('Role belongs to another app');
      }
      if (role.tenantId && role.tenantId !== tenantId) {
        throw new BadRequestException('Role belongs to another tenant');
      }
    }

    return this.prisma.tenantMembership.update({
      where: { id: membershipId },
      data: body as never,
    });
  }

  private assertTenantAccess(id: string, tenantContext?: TenantContext) {
    if (
      !tenantContext?.isPlatform &&
      tenantContext?.tenantId &&
      tenantContext.tenantId !== id
    ) {
      throw new ForbiddenException('Tenant is outside current context');
    }
  }

  private async findTenantOrThrow(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  private async resolveMemberUser(body: AddTenantMemberDto) {
    if (body.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: body.userId } });
      if (!user) throw new BadRequestException('User not found');
      return user.id;
    }

    if (!body.email && !body.phone) {
      throw new BadRequestException('userId, email, or phone is required');
    }

    const existing = body.email
      ? await this.prisma.user.findUnique({ where: { email: body.email } })
      : body.phone
        ? await this.prisma.user.findUnique({ where: { phone: body.phone } })
        : null;
    if (existing) return existing.id;

    const passwordHash = await bcrypt.hash(body.password ?? 'ChangeMe123!', 12);
    const user = await this.prisma.user.create({
      data: {
        email: body.email,
        phone: body.phone,
        displayName: body.displayName,
        passwordHash,
        status: 'active',
      },
    });
    return user.id;
  }
}
