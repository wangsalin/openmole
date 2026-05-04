import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { buildPagination, omitUndefined } from '../../common/prisma-list';
import {
  assertTenantScopedAccess,
  tenantScopedQuery,
} from '../../common/tenant-scope';
import { TenantContext } from '../../common/types/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import {
  CheckEntitlementDto,
  CreateUsageLedgerDto,
  ListUsageLedgerDto,
} from './dto/usage.dto';

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  ledger(query: ListUsageLedgerDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scope = tenantScopedQuery(query, tenantContext);
    return this.prisma.usageLedger.findMany({
      where: omitUndefined({
        appId: scope.appId,
        tenantId: scope.tenantId,
        featureKey: query.featureKey,
      }),
      skip,
      take,
      orderBy: { occurredAt: 'desc' },
    });
  }

  async record(body: CreateUsageLedgerDto, tenantContext?: TenantContext) {
    if (tenantContext) {
      assertTenantScopedAccess(body, tenantContext);
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const ledger = await tx.usageLedger.create({ data: body as never });
      const quotaUpdate = await tx.quotaBucket.updateMany({
        where: {
          appId: body.appId,
          tenantId: body.tenantId,
          featureKey: body.featureKey,
          metric: body.metric,
          periodStart: { lte: now },
          periodEnd: { gte: now },
        },
        data: {
          used: { increment: body.quantity },
        },
      });
      return { ledger, quotaUpdated: quotaUpdate.count };
    });
  }

  quotas(query: ListUsageLedgerDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scope = tenantScopedQuery(query, tenantContext);
    return this.prisma.quotaBucket.findMany({
      where: omitUndefined({
        appId: scope.appId,
        tenantId: scope.tenantId,
        featureKey: query.featureKey,
      }),
      skip,
      take,
      orderBy: { periodStart: 'desc' },
    });
  }

  async checkEntitlement(body: CheckEntitlementDto, tenantContext?: TenantContext) {
    const now = new Date();
    const quantity = body.quantity ?? 1;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: body.tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenantContext && !tenantContext.isPlatform) {
      if (
        !tenantContext?.appId ||
        tenant.appId !== tenantContext.appId ||
        (tenantContext.tenantId && body.tenantId !== tenantContext.tenantId)
      ) {
        throw new ForbiddenException('Tenant is outside current context');
      }
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        appId: tenant.appId,
        tenantId: tenant.id,
        status: { in: ['active', 'trialing'] },
        startAt: { lte: now },
        endAt: { gte: now },
      },
      orderBy: { endAt: 'desc' },
    });
    if (!subscription) {
      return { allowed: false, reason: 'no_active_subscription' };
    }

    const feature = await this.prisma.feature.findUnique({
      where: { featureKey: body.featureKey },
    });
    if (!feature || feature.status !== 'active') {
      return { allowed: false, reason: 'feature_not_found' };
    }

    const planFeature = await this.prisma.planFeature.findUnique({
      where: {
        planId_featureId: {
          planId: subscription.planId,
          featureId: feature.id,
        },
      },
    });
    if (!planFeature?.enabled) {
      return { allowed: false, reason: 'feature_not_enabled' };
    }
    if (!feature.isMetered || planFeature.quotaLimit === null) {
      return {
        allowed: true,
        reason: 'feature_enabled',
        subscriptionId: subscription.id,
        planId: subscription.planId,
      };
    }

    const metric = body.metric ?? planFeature.quotaType ?? 'count';
    const quota = await this.prisma.quotaBucket.findFirst({
      where: {
        appId: tenant.appId,
        tenantId: tenant.id,
        featureKey: feature.featureKey,
        metric,
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!quota) {
      return {
        allowed: false,
        reason: 'quota_bucket_not_found',
        subscriptionId: subscription.id,
        planId: subscription.planId,
        featureKey: feature.featureKey,
        metric,
      };
    }

    const remaining = Math.max(quota.limit - quota.used, 0);
    const allowed = quantity <= remaining;
    return {
      allowed,
      reason: allowed ? 'within_quota' : 'quota_exceeded',
      requested: quantity,
      remaining,
      subscriptionId: subscription.id,
      planId: subscription.planId,
      quota,
    };
  }
}
