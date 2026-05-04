import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { buildPagination, omitUndefined } from '../../common/prisma-list';
import {
  assertTenantScopedAccess,
  requireTenantWriteScope,
  tenantScopedQuery,
} from '../../common/tenant-scope';
import { TenantContext } from '../../common/types/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import { ALLOWED_API_KEY_SCOPES } from './api-key-scopes';
import {
  CreateApiKeyDto,
  CreateWebhookDto,
  ListApiKeysDto,
  ListWebhookDeliveriesDto,
  ListWebhooksDto,
} from './dto/developer.dto';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Injectable()
export class DeveloperService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookDelivery: WebhookDeliveryService,
  ) {}

  apiKeys(query: ListApiKeysDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scope = tenantScopedQuery(query, tenantContext);
    return this.prisma.apiKey.findMany({
      where: omitUndefined({
        appId: scope.appId,
        tenantId: scope.tenantId,
        status: query.status,
      }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        appId: true,
        tenantId: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async createApiKey(body: CreateApiKeyDto, tenantContext?: TenantContext) {
    const scope = this.resolveTenantWriteBody(body, tenantContext);
    await this.ensureAppTenant(scope.appId, scope.tenantId);
    this.assertAllowedScopes(body.scopes);
    if (body.expiresAt && body.expiresAt <= new Date()) {
      throw new BadRequestException('API key expiration must be in the future');
    }

    const rawKey = `sk_${randomBytes(24).toString('hex')}`;
    const keyPrefix = rawKey.slice(0, 10);
    const keyHash = await bcrypt.hash(rawKey, 12);
    const apiKey = await this.prisma.apiKey.create({
      data: {
        appId: scope.appId,
        tenantId: scope.tenantId,
        name: body.name,
        expiresAt: body.expiresAt,
        keyHash,
        keyPrefix,
        scopes: body.scopes,
      } as never,
      select: {
        id: true,
        appId: true,
        tenantId: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        status: true,
      },
    });
    return { ...apiKey, apiKey: rawKey };
  }

  async disableApiKey(id: string, tenantContext?: TenantContext) {
    const apiKey = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!apiKey) throw new NotFoundException('API key not found');
    assertTenantScopedAccess(apiKey, tenantContext, 'API key is outside tenant context');
    const disabled = await this.prisma.apiKey.update({
      where: { id },
      data: { status: 'disabled' },
      select: {
        id: true,
        appId: true,
        tenantId: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        status: true,
        createdAt: true,
      },
    });
    await this.webhookDelivery.dispatch({
      appId: disabled.appId,
      tenantId: disabled.tenantId,
      eventType: 'api_key.disabled',
      payload: {
        apiKeyId: disabled.id,
        keyPrefix: disabled.keyPrefix,
        name: disabled.name,
        scopes: disabled.scopes,
      },
    });
    return disabled;
  }

  webhooks(query: ListWebhooksDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scope = tenantScopedQuery(query, tenantContext);
    return this.prisma.webhook.findMany({
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

  async createWebhook(body: CreateWebhookDto, tenantContext?: TenantContext) {
    const scope = this.resolveTenantWriteBody(body, tenantContext);
    await this.ensureAppTenant(scope.appId, scope.tenantId);
    return this.prisma.webhook.create({
      data: {
        appId: scope.appId,
        tenantId: scope.tenantId,
        name: body.name,
        url: body.url,
        secretRef: body.secretRef,
        events: body.events,
      } as never,
    });
  }

  async deliveries(
    webhookId: string,
    query: ListWebhookDeliveriesDto,
    tenantContext?: TenantContext,
  ) {
    const webhook = await this.findWebhookForScope(webhookId, tenantContext);
    const { skip, take } = buildPagination(query);
    return this.prisma.webhookDelivery.findMany({
      where: omitUndefined({ webhookId: webhook.id, status: query.status }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async retryDelivery(
    webhookId: string,
    deliveryId: string,
    tenantContext?: TenantContext,
  ) {
    const webhook = await this.findWebhookForScope(webhookId, tenantContext);
    return this.webhookDelivery.retry(webhook.id, deliveryId);
  }

  private resolveTenantWriteBody(
    body: { appId: string; tenantId: string },
    tenantContext?: TenantContext,
  ) {
    if (tenantContext?.isPlatform) {
      return { appId: body.appId, tenantId: body.tenantId };
    }
    return requireTenantWriteScope(tenantContext);
  }

  private async findWebhookForScope(
    webhookId: string,
    tenantContext?: TenantContext,
  ) {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook) throw new NotFoundException('Webhook not found');
    assertTenantScopedAccess(webhook, tenantContext, 'Webhook is outside tenant context');
    return webhook;
  }

  private async ensureAppTenant(appId: string, tenantId: string) {
    const [app, tenant] = await Promise.all([
      this.prisma.app.findUnique({ where: { id: appId } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
    ]);
    if (!app) throw new BadRequestException('App not found');
    if (!tenant) throw new BadRequestException('Tenant not found');
    if (tenant.appId !== app.id) {
      throw new BadRequestException('Tenant belongs to another app');
    }
    if (tenant.status !== 'active') {
      throw new BadRequestException('Tenant is not active');
    }
  }

  private assertAllowedScopes(scopes: string[]) {
    const invalidScopes = scopes.filter(
      (scope) => !ALLOWED_API_KEY_SCOPES.includes(scope),
    );
    if (invalidScopes.length) {
      throw new BadRequestException(`Unsupported API key scopes: ${invalidScopes.join(', ')}`);
    }
  }
}
