import { Injectable, NotFoundException } from '@nestjs/common';
import { buildPagination, omitUndefined } from '../../common/prisma-list';
import {
  assertTenantScopedAccess,
  tenantScopedQuery,
} from '../../common/tenant-scope';
import { TenantContext } from '../../common/types/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePermissionDto,
  CreateRoleDto,
  ListPermissionsDto,
  ListRolesDto,
} from './dto/permission.dto';

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  roles(query: ListRolesDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scope = tenantScopedQuery(query, tenantContext);
    return this.prisma.role.findMany({
      where: omitUndefined({
        appId: scope.appId,
        tenantId: scope.tenantId,
        status: query.status,
      }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  createRole(body: CreateRoleDto, tenantContext?: TenantContext) {
    const data = tenantContext?.isPlatform
      ? body
      : {
          ...body,
          appId: tenantContext?.appId,
          tenantId: tenantContext?.tenantId ?? null,
        };
    assertTenantScopedAccess(data, tenantContext, 'Role is outside tenant context');
    return this.prisma.role.create({ data: data as never });
  }

  permissions(query: ListPermissionsDto) {
    const { skip, take } = buildPagination(query);
    return this.prisma.permission.findMany({
      where: omitUndefined({ module: query.module, status: query.status }),
      skip,
      take,
      orderBy: { module: 'asc' },
    });
  }

  createPermission(body: CreatePermissionDto) {
    return this.prisma.permission.create({ data: body as never });
  }

  async grantPermissions(
    roleId: string,
    permissionIds: string[],
    tenantContext?: TenantContext,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    assertTenantScopedAccess(role, tenantContext, 'Role is outside tenant context');
    await this.prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });
    return this.prisma.rolePermission.findMany({ where: { roleId } });
  }
}
