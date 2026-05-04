import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentTenantContext } from '../../common/decorators/tenant-context.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { TenantContext } from '../../common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateApiKeyDto,
  CreateWebhookDto,
  ListApiKeysDto,
  ListWebhookDeliveriesDto,
  ListWebhooksDto,
} from './dto/developer.dto';
import { DeveloperService } from './developer.service';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/v1/developer')
export class DeveloperController {
  constructor(private readonly developer: DeveloperService) {}

  @Get('api-keys')
  @RequirePermissions('developer.api_key.read')
  apiKeys(
    @Query() query: ListApiKeysDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.developer.apiKeys(query, tenantContext);
  }

  @Post('api-keys')
  @RequirePermissions('developer.api_key.create')
  createApiKey(
    @Body() body: CreateApiKeyDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.developer.createApiKey(body, tenantContext);
  }

  @Post('api-keys/:id/disable')
  @RequirePermissions('developer.api_key.disable')
  disableApiKey(
    @Param('id') id: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.developer.disableApiKey(id, tenantContext);
  }

  @Get('webhooks')
  @RequirePermissions('developer.webhook.read')
  webhooks(
    @Query() query: ListWebhooksDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.developer.webhooks(query, tenantContext);
  }

  @Post('webhooks')
  @RequirePermissions('developer.webhook.create')
  createWebhook(
    @Body() body: CreateWebhookDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.developer.createWebhook(body, tenantContext);
  }

  @Get('webhooks/:id/deliveries')
  @RequirePermissions('developer.webhook.delivery.read')
  deliveries(
    @Param('id') webhookId: string,
    @Query() query: ListWebhookDeliveriesDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.developer.deliveries(webhookId, query, tenantContext);
  }

  @Post('webhooks/:id/deliveries/:deliveryId/retry')
  @RequirePermissions('developer.webhook.delivery.retry')
  retryDelivery(
    @Param('id') webhookId: string,
    @Param('deliveryId') deliveryId: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.developer.retryDelivery(webhookId, deliveryId, tenantContext);
  }
}
