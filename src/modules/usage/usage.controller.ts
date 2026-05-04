import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentTenantContext } from '../../common/decorators/tenant-context.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { TenantContext } from '../../common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CheckEntitlementDto,
  CreateUsageLedgerDto,
  ListUsageLedgerDto,
} from './dto/usage.dto';
import { UsageService } from './usage.service';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/v1/usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('ledger')
  @RequirePermissions('usage.ledger.read')
  ledger(
    @Query() query: ListUsageLedgerDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.usage.ledger(query, tenantContext);
  }

  @Post('ledger')
  @RequirePermissions('usage.ledger.create')
  createLedger(
    @Body() body: CreateUsageLedgerDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.usage.record(body, tenantContext);
  }

  @Get('quotas')
  @RequirePermissions('usage.quota.read')
  quotas(
    @Query() query: ListUsageLedgerDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.usage.quotas(query, tenantContext);
  }

  @Post('entitlements/check')
  @RequirePermissions('usage.entitlement.check')
  check(
    @Body() body: CheckEntitlementDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.usage.checkEntitlement(body, tenantContext);
  }
}
