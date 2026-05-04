import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { buildPagination, omitUndefined } from '../../common/prisma-list';
import { TenantContext } from '../../common/types/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, ListUsersDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUsersDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scopedUserIds = await this.scopedUserIds(tenantContext);
    return this.prisma.user.findMany({
      where: omitUndefined({
        id: scopedUserIds ? { in: scopedUserIds } : undefined,
        status: query.status,
        email: query.email,
      }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        phone: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async create(body: CreateUserDto, tenantContext?: TenantContext) {
    if (tenantContext && !tenantContext.isPlatform) {
      throw new ForbiddenException('Tenant users must add users through tenant members');
    }
    const password = String(body.password ?? 'ChangeMe123!');
    const passwordHash = await bcrypt.hash(password, 12);
    const { password: _password, ...data } = body;
    return this.prisma.user.create({
      data: { ...data, passwordHash } as never,
      select: {
        id: true,
        phone: true,
        email: true,
        displayName: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async get(id: string, tenantContext?: TenantContext) {
    await this.assertUserAccess(id, tenantContext);
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, body: UpdateUserDto, tenantContext?: TenantContext) {
    await this.assertUserAccess(id, tenantContext);
    const data: Record<string, unknown> = { ...body };
    if (body.password) {
      data.passwordHash = await bcrypt.hash(String(body.password), 12);
      delete data.password;
    }
    return this.prisma.user.update({
      where: { id },
      data: data as never,
      select: {
        id: true,
        phone: true,
        email: true,
        displayName: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  private async scopedUserIds(tenantContext?: TenantContext) {
    if (!tenantContext || tenantContext.isPlatform) return undefined;
    const memberships = await this.prisma.tenantMembership.findMany({
      where: omitUndefined({
        appId: tenantContext.appId,
        tenantId: tenantContext.tenantId ?? undefined,
        status: 'active',
      }),
      select: { userId: true },
    });
    return memberships.map((membership) => membership.userId);
  }

  private async assertUserAccess(id: string, tenantContext?: TenantContext) {
    if (!tenantContext || tenantContext.isPlatform) return;
    const membership = await this.prisma.tenantMembership.findFirst({
      where: omitUndefined({
        userId: id,
        appId: tenantContext.appId,
        tenantId: tenantContext.tenantId ?? undefined,
        status: 'active',
      }),
    });
    if (!membership) {
      throw new ForbiddenException('User is outside current context');
    }
  }
}
