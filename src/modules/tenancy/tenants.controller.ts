import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenantContext } from '../../common/decorators/tenant-context.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { TenantContext } from '../../common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AddTenantMemberDto,
  CreateTenantDto,
  ListTenantMembersDto,
  ListTenantsDto,
  UpdateTenantMemberDto,
  UpdateTenantDto,
} from './dto/tenant.dto';
import { TenantsService } from './tenants.service';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/v1/tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @RequirePermissions('tenant.read')
  list(
    @Query() query: ListTenantsDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tenants.list(query, tenantContext);
  }

  @Post()
  @RequirePermissions('tenant.create')
  create(
    @Body() body: CreateTenantDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tenants.create(body, tenantContext);
  }

  @Get(':id')
  @RequirePermissions('tenant.read')
  get(
    @Param('id') id: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tenants.get(id, tenantContext);
  }

  @Patch(':id')
  @RequirePermissions('tenant.update')
  update(
    @Param('id') id: string,
    @Body() body: UpdateTenantDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tenants.update(id, body, tenantContext);
  }

  @Post(':id/approve')
  @RequirePermissions('tenant.update')
  approve(
    @Param('id') id: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tenants.update(id, { status: 'active' }, tenantContext);
  }

  @Post(':id/disable')
  @RequirePermissions('tenant.update')
  disable(
    @Param('id') id: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tenants.update(id, { status: 'disabled' }, tenantContext);
  }

  @Get(':id/roles')
  @RequirePermissions('permission.role.read')
  roles(
    @Param('id') id: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tenants.roles(id, tenantContext);
  }

  @Post(':id/initialize-roles')
  @RequirePermissions('permission.role.create')
  initializeRoles(
    @Param('id') id: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tenants.initializeRoles(id, tenantContext);
  }

  @Get(':id/members')
  @RequirePermissions('tenant.member.read')
  members(
    @Param('id') id: string,
    @Query() query: ListTenantMembersDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tenants.members(id, query, tenantContext);
  }

  @Post(':id/members')
  @RequirePermissions('tenant.member.create')
  addMember(
    @Param('id') id: string,
    @Body() body: AddTenantMemberDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tenants.addMember(id, body, tenantContext);
  }

  @Patch(':id/members/:membershipId')
  @RequirePermissions('tenant.member.update')
  updateMember(
    @Param('id') id: string,
    @Param('membershipId') membershipId: string,
    @Body() body: UpdateTenantMemberDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tenants.updateMember(id, membershipId, body, tenantContext);
  }

  @Post(':id/members/:membershipId/disable')
  @RequirePermissions('tenant.member.disable')
  disableMember(
    @Param('id') id: string,
    @Param('membershipId') membershipId: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tenants.updateMember(
      id,
      membershipId,
      { status: 'disabled' },
      tenantContext,
    );
  }
}
