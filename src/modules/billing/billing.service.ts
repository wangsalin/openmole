import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { buildPagination, omitUndefined } from '../../common/prisma-list';
import {
  assertTenantScopedAccess,
  tenantScopedQuery,
} from '../../common/tenant-scope';
import { TenantContext } from '../../common/types/authenticated-request';
import { WebhookDeliveryService } from '../developer/webhook-delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttachPlanFeatureDto,
  CreateFeatureDto,
  CreateOrderDto,
  CreatePlanDto,
  CreateSubscriptionDto,
  CreateTenantOrderDto,
  ListFeaturesDto,
  ListPlansDto,
  ListSubscriptionsDto,
  OpenSubscriptionDto,
  PaymentWebhookDto,
  StartOrderPaymentDto,
} from './dto/billing.dto';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookDelivery: WebhookDeliveryService,
    private readonly config: ConfigService,
  ) {}

  features(query: ListFeaturesDto) {
    const { skip, take } = buildPagination(query);
    return this.prisma.feature.findMany({
      where: omitUndefined({ module: query.module, status: query.status }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  createFeature(body: CreateFeatureDto) {
    return this.prisma.feature.create({ data: body });
  }

  plans(query: ListPlansDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scope = tenantScopedQuery(query, tenantContext);
    return this.prisma.plan.findMany({
      where: omitUndefined({ appId: scope.appId, status: query.status }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  createPlan(body: CreatePlanDto) {
    return this.prisma.plan.create({ data: body as never });
  }

  async planFeatures(planId: string, tenantContext?: TenantContext) {
    const plan = await this.ensurePlan(planId);
    assertTenantScopedAccess(
      { appId: plan.appId, tenantId: undefined },
      tenantContext,
      'Plan is outside tenant context',
    );
    const planFeatures = await this.prisma.planFeature.findMany({
      where: { planId },
      orderBy: { createdAt: 'asc' },
    });
    const features = await this.prisma.feature.findMany({
      where: { id: { in: planFeatures.map((item) => item.featureId) } },
    });
    const featureById = new Map(features.map((feature) => [feature.id, feature]));
    return planFeatures.map((item) => ({
      ...item,
      feature: featureById.get(item.featureId),
    }));
  }

  async attachFeature(
    planId: string,
    body: AttachPlanFeatureDto,
    tenantContext?: TenantContext,
  ) {
    const plan = await this.ensurePlan(planId);
    assertTenantScopedAccess(
      { appId: plan.appId, tenantId: undefined },
      tenantContext,
      'Plan is outside tenant context',
    );
    await this.ensureFeature(body.featureId);
    return this.prisma.planFeature.upsert({
      where: {
        planId_featureId: {
          planId,
          featureId: body.featureId,
        },
      },
      update: {
        enabled: body.enabled ?? true,
        quotaType: body.quotaType,
        quotaLimit: body.quotaLimit,
        resetCycle: body.resetCycle,
      },
      create: {
        planId,
        featureId: body.featureId,
        enabled: body.enabled ?? true,
        quotaType: body.quotaType,
        quotaLimit: body.quotaLimit,
        resetCycle: body.resetCycle,
      },
    });
  }

  subscriptions(query: ListSubscriptionsDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scope = tenantScopedQuery(query, tenantContext);
    return this.prisma.subscription.findMany({
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

  createSubscription(body: CreateSubscriptionDto, tenantContext?: TenantContext) {
    assertTenantScopedAccess(
      body,
      tenantContext,
      'Subscription is outside tenant context',
    );
    return this.prisma.subscription.create({ data: body as never });
  }

  async openSubscription(body: OpenSubscriptionDto, tenantContext?: TenantContext) {
    if (tenantContext && !tenantContext.isPlatform) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: body.tenantId },
      });
      if (!tenant) throw new NotFoundException('Tenant not found');
      assertTenantScopedAccess(
        tenant,
        tenantContext,
        'Subscription is outside tenant context',
      );
    }
    return this.openSubscriptionForPlan(body.tenantId, body.planId, body.months ?? 1);
  }

  private async openSubscriptionForPlan(tenantId: string, planId: string, months: number) {
    const [tenant, plan] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.plan.findUnique({ where: { id: planId } }),
    ]);
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!plan) throw new NotFoundException('Plan not found');
    if (tenant.appId !== plan.appId) {
      throw new BadRequestException('Tenant and plan belong to different apps');
    }

    const startAt = new Date();
    const endAt = this.addMonths(startAt, months);
    const planFeatures = await this.prisma.planFeature.findMany({
      where: { planId: plan.id, enabled: true },
    });
    const features = await this.prisma.feature.findMany({
      where: { id: { in: planFeatures.map((item) => item.featureId) } },
    });
    const featureById = new Map(features.map((feature) => [feature.id, feature]));

    const result = await this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          appId: tenant.appId,
          tenantId: tenant.id,
          planId: plan.id,
          status: 'active',
          startAt,
          endAt,
          autoRenew: false,
        },
      });

      await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          currentPlanId: plan.id,
          subscriptionStatus: 'active',
          expiredAt: endAt,
        },
      });

      const quotaRows = planFeatures
        .filter((item) => item.quotaLimit !== null)
        .map((item) => {
          const feature = featureById.get(item.featureId);
          if (!feature) return undefined;
          return {
            appId: tenant.appId,
            tenantId: tenant.id,
            featureKey: feature.featureKey,
            metric: item.quotaType ?? 'count',
            periodStart: startAt,
            periodEnd: endAt,
            limit: item.quotaLimit ?? 0,
            used: 0,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      if (quotaRows.length) {
        await tx.quotaBucket.createMany({
          data: quotaRows,
          skipDuplicates: true,
        });
      }

      return {
        subscription,
        quotasCreated: quotaRows.length,
      };
    });
    await this.webhookDelivery.dispatch({
      appId: tenant.appId,
      tenantId: tenant.id,
      eventType: 'subscription.opened',
      payload: {
        subscriptionId: result.subscription.id,
        tenantId: tenant.id,
        planId: plan.id,
        startAt,
        endAt,
        quotasCreated: result.quotasCreated,
      },
    });
    return result;
  }

  orders(query: Record<string, string>, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scope = tenantScopedQuery(query, tenantContext);
    return this.prisma.order.findMany({
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

  async createOrder(body: CreateOrderDto) {
    await this.ensureOrderScope(body);
    const orderNo = body.orderNo ?? `ORD${Date.now()}`;
    return this.prisma.order.create({
      data: { ...body, orderNo, status: 'pending' } as never,
    });
  }

  async createTenantOrder(body: CreateTenantOrderDto, tenantContext?: TenantContext) {
    const scope = this.requireTenantScope(tenantContext);
    const [tenant, plan] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: scope.tenantId } }),
      this.prisma.plan.findUnique({ where: { id: body.planId } }),
    ]);
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!plan) throw new NotFoundException('Plan not found');
    if (tenant.appId !== scope.appId || plan.appId !== scope.appId) {
      throw new ForbiddenException('Plan is outside tenant context');
    }
    const amount = Number(plan.priceMonthly ?? 0);
    return this.prisma.order.create({
      data: {
        appId: scope.appId,
        tenantId: scope.tenantId,
        planId: plan.id,
        orderNo: `ORD${Date.now()}`,
        amount,
        currency: body.currency ?? 'CNY',
        status: 'pending',
      },
    });
  }

  async order(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async orderForTenant(id: string, tenantContext?: TenantContext) {
    const order = await this.order(id);
    this.assertOrderTenantAccess(order, tenantContext);
    return order;
  }

  async markOrderPendingPayment(id: string, body: StartOrderPaymentDto) {
    const order = await this.order(id);
    return this.createPendingPaymentTransaction(order, body);
  }

  async markTenantOrderPendingPayment(
    id: string,
    body: StartOrderPaymentDto,
    tenantContext?: TenantContext,
  ) {
    const order = await this.order(id);
    this.assertOrderTenantAccess(order, tenantContext);
    return this.createPendingPaymentTransaction(order, body);
  }

  async handlePaymentWebhook(
    provider: string,
    body: PaymentWebhookDto,
    signature?: string,
  ) {
    this.assertPaymentSignature(provider, body, signature);
    const order = await this.prisma.order.findUnique({
      where: { orderNo: body.orderNo },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (Number(order.amount) !== Number(body.amount)) {
      throw new BadRequestException('Payment amount does not match order amount');
    }

    const targetOrderStatus = this.toOrderStatus(body.status);
    const existingTransaction = body.providerTradeNo
      ? await this.prisma.paymentTransaction.findFirst({
          where: {
            provider,
            providerTradeNo: body.providerTradeNo,
            orderId: order.id,
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    if (
      existingTransaction?.status === body.status &&
      order.status === targetOrderStatus
    ) {
      return {
        idempotent: true,
        order,
        transaction: existingTransaction,
        subscription: null,
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const latestOrder = await tx.order.findUnique({ where: { id: order.id } });
      if (!latestOrder) throw new NotFoundException('Order not found');
      const alreadyPaid = latestOrder.status === 'paid';
      const transaction = await tx.paymentTransaction.create({
        data: {
          appId: latestOrder.appId,
          tenantId: latestOrder.tenantId,
          orderId: latestOrder.id,
          provider,
          providerTradeNo: body.providerTradeNo,
          amount: latestOrder.amount,
          status: body.status,
          rawPayload: body as never,
        },
      });

      const updatedOrder =
        alreadyPaid && body.status === 'succeeded'
          ? latestOrder
          : await tx.order.update({
              where: { id: latestOrder.id },
              data: {
                status: targetOrderStatus,
                paidAt:
                  body.status === 'succeeded'
                    ? body.paidAt ?? new Date()
                    : latestOrder.paidAt,
              },
            });

      return {
        order: updatedOrder,
        transaction,
        shouldOpenSubscription:
          body.status === 'succeeded' && !alreadyPaid && Boolean(latestOrder.planId),
        planId: latestOrder.planId,
      };
    });

    const subscription =
      result.shouldOpenSubscription && result.planId
        ? await this.openSubscriptionForPlan(
            result.order.tenantId,
            result.planId,
            body.months ?? 1,
          )
        : null;

    return {
      idempotent: false,
      order: result.order,
      transaction: result.transaction,
      subscription,
    };
  }

  private async ensurePlan(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  private async ensureFeature(id: string) {
    const feature = await this.prisma.feature.findUnique({ where: { id } });
    if (!feature) throw new NotFoundException('Feature not found');
    return feature;
  }

  private async ensureOrderScope(body: CreateOrderDto) {
    const [tenant, plan] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: body.tenantId } }),
      body.planId ? this.prisma.plan.findUnique({ where: { id: body.planId } }) : null,
    ]);
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.appId !== body.appId) {
      throw new BadRequestException('Tenant belongs to another app');
    }
    if (!body.planId) return;
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.appId !== body.appId) {
      throw new BadRequestException('Plan belongs to another app');
    }
  }

  private requireTenantScope(tenantContext?: TenantContext) {
    if (!tenantContext?.appId || !tenantContext.tenantId) {
      throw new ForbiddenException('Tenant context is required');
    }
    return {
      appId: tenantContext.appId,
      tenantId: tenantContext.tenantId,
    };
  }

  private assertOrderTenantAccess(
    order: { appId: string; tenantId: string },
    tenantContext?: TenantContext,
  ) {
    if (tenantContext?.isPlatform) {
      if (
        tenantContext.appId &&
        tenantContext.tenantId &&
        order.appId === tenantContext.appId &&
        order.tenantId === tenantContext.tenantId
      ) {
        return;
      }
      throw new ForbiddenException('Tenant context is required');
    }
    const scope = this.requireTenantScope(tenantContext);
    if (order.appId !== scope.appId || order.tenantId !== scope.tenantId) {
      throw new ForbiddenException('Order is outside tenant context');
    }
  }

  private async createPendingPaymentTransaction(
    order: { id: string; appId: string; tenantId: string; amount: unknown },
    body: StartOrderPaymentDto,
  ) {
    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        appId: order.appId,
        tenantId: order.tenantId,
        orderId: order.id,
        provider: body.provider ?? 'manual',
        amount: order.amount as never,
        status: 'pending',
        rawPayload: body as never,
      },
    });
    return { order, transaction };
  }

  private addMonths(date: Date, months: number) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
  }

  private toOrderStatus(status: PaymentWebhookDto['status']) {
    if (status === 'succeeded') return 'paid';
    if (status === 'refunded') return 'refunded';
    return 'failed';
  }

  private assertPaymentSignature(
    provider: string,
    body: PaymentWebhookDto,
    signature?: string,
  ) {
    const secret = this.paymentWebhookSecret(provider);
    if (!secret) return;
    if (!signature) throw new ForbiddenException('Missing payment signature');
    const expected = createHmac('sha256', secret)
      .update(this.paymentSignaturePayload(provider, body))
      .digest('hex');
    const actual = signature.startsWith('sha256=')
      ? signature.slice('sha256='.length)
      : signature;
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(actual, 'hex');
    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new ForbiddenException('Invalid payment signature');
    }
  }

  private paymentWebhookSecret(provider: string) {
    const normalized = provider.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return (
      this.config.get<string>(`PAYMENT_${normalized}_WEBHOOK_SECRET`) ??
      this.config.get<string>('PAYMENT_WEBHOOK_SECRET')
    );
  }

  private paymentSignaturePayload(provider: string, body: PaymentWebhookDto) {
    return [
      provider,
      body.orderNo,
      body.providerTradeNo ?? '',
      body.status,
      Number(body.amount).toFixed(2),
    ].join(':');
  }
}
