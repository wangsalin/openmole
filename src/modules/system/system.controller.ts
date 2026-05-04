import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentTenantContext } from '../../common/decorators/tenant-context.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { TenantContext } from '../../common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateDictItemDto,
  ListDictItemsDto,
  ListSettingsDto,
  UpsertSettingDto,
} from './dto/system.dto';
import { SystemService } from './system.service';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/v1/system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('settings')
  @RequirePermissions('system.setting.read')
  settings(
    @Query() query: ListSettingsDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.system.settings(query, tenantContext);
  }

  @Post('settings')
  @RequirePermissions('system.setting.update')
  upsertSetting(
    @Body() body: UpsertSettingDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.system.upsertSetting(body, tenantContext);
  }

  @Get('dict-items')
  @RequirePermissions('system.dict.read')
  dictItems(@Query() query: ListDictItemsDto) {
    return this.system.dictItems(query);
  }

  @Post('dict-items')
  @RequirePermissions('system.dict.create')
  createDictItem(@Body() body: CreateDictItemDto) {
    return this.system.createDictItem(body);
  }
}
