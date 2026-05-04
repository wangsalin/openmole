import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentTenantContext } from '../../common/decorators/tenant-context.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { TenantContext } from '../../common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreatePermissionDto,
  CreateRoleDto,
  GrantPermissionsDto,
  ListPermissionsDto,
  ListRolesDto,
} from './dto/permission.dto';
import { PermissionService } from './permission.service';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/v1/permission')
export class PermissionController {
  constructor(private readonly permission: PermissionService) {}

  @Get('roles')
  @RequirePermissions('permission.role.read')
  roles(
    @Query() query: ListRolesDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.permission.roles(query, tenantContext);
  }

  @Post('roles')
  @RequirePermissions('permission.role.create')
  createRole(
    @Body() body: CreateRoleDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.permission.createRole(body, tenantContext);
  }

  @Get('permissions')
  @RequirePermissions('permission.permission.read')
  permissions(@Query() query: ListPermissionsDto) {
    return this.permission.permissions(query);
  }

  @Post('permissions')
  @RequirePermissions('permission.permission.create')
  createPermission(@Body() body: CreatePermissionDto) {
    return this.permission.createPermission(body);
  }

  @Post('roles/:id/permissions')
  @RequirePermissions('permission.role.update')
  grantPermissions(
    @Param('id') id: string,
    @Body() body: GrantPermissionsDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.permission.grantPermissions(id, body.permissionIds ?? [], tenantContext);
  }
}
