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
import { CurrentTenantContext } from '../../common/decorators/tenant-context.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { TenantContext } from '../../common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateAppDto, ListAppsDto, UpdateAppDto } from './dto/app.dto';
import { AppsService } from './apps.service';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/v1/apps')
export class AppsController {
  constructor(private readonly apps: AppsService) {}

  @Get()
  @RequirePermissions('app.read')
  list(
    @Query() query: ListAppsDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.apps.list(query, tenantContext);
  }

  @Post()
  @RequirePermissions('app.create')
  create(@Body() body: CreateAppDto) {
    return this.apps.create(body);
  }

  @Get(':id')
  @RequirePermissions('app.read')
  get(
    @Param('id') id: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.apps.get(id, tenantContext);
  }

  @Patch(':id')
  @RequirePermissions('app.update')
  update(
    @Param('id') id: string,
    @Body() body: UpdateAppDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.apps.update(id, body, tenantContext);
  }

  @Post(':id/disable')
  @RequirePermissions('app.update')
  disable(
    @Param('id') id: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.apps.update(id, { status: 'disabled' }, tenantContext);
  }
}
