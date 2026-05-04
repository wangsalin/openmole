import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenantContext } from '../../common/decorators/tenant-context.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { TenantContext } from '../../common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AttachPlanFeatureDto,
  CreateFeatureDto,
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
import { BillingService } from './billing.service';

@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('admin/v1/features')
  @RequirePermissions('billing.feature.read')
  features(@Query() query: ListFeaturesDto) {
    return this.billing.features(query);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/features')
  @RequirePermissions('billing.feature.create')
  createFeature(@Body() body: CreateFeatureDto) {
    return this.billing.createFeature(body);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('admin/v1/plans')
  @RequirePermissions('billing.plan.read')
  plans(
    @Query() query: ListPlansDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.billing.plans(query, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/plans')
  @RequirePermissions('billing.plan.create')
  createPlan(@Body() body: CreatePlanDto) {
    return this.billing.createPlan(body);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('admin/v1/plans/:id/features')
  @RequirePermissions('billing.plan.read')
  planFeatures(
    @Param('id') planId: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.billing.planFeatures(planId, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/plans/:id/features')
  @RequirePermissions('billing.plan.update')
  attachFeature(
    @Param('id') planId: string,
    @Body() body: AttachPlanFeatureDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.billing.attachFeature(planId, body, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('admin/v1/subscriptions')
  @RequirePermissions('billing.subscription.read')
  subscriptions(
    @Query() query: ListSubscriptionsDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.billing.subscriptions(query, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/subscriptions')
  @RequirePermissions('billing.subscription.create')
  createSubscription(
    @Body() body: CreateSubscriptionDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.billing.createSubscription(body, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/subscriptions/open')
  @RequirePermissions('billing.subscription.create')
  openSubscription(
    @Body() body: OpenSubscriptionDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.billing.openSubscription(body, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('admin/v1/orders')
  @RequirePermissions('billing.order.read')
  adminOrders(
    @Query() query: Record<string, string>,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.billing.orders(query, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('tenant/v1/orders')
  @RequirePermissions('billing.order.create')
  createOrder(
    @Body() body: CreateTenantOrderDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.billing.createTenantOrder(body, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('tenant/v1/orders/:id')
  @RequirePermissions('billing.order.read')
  order(
    @Param('id') id: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.billing.orderForTenant(id, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('tenant/v1/orders/:id/pay')
  @RequirePermissions('billing.order.pay')
  pay(
    @Param('id') id: string,
    @Body() body: StartOrderPaymentDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.billing.markTenantOrderPendingPayment(id, body, tenantContext);
  }

  @Post('payment/webhook/:provider')
  paymentWebhook(
    @Param('provider') provider: string,
    @Body() body: PaymentWebhookDto,
    @Headers('x-payment-signature') signature?: string,
  ) {
    return this.billing.handlePaymentWebhook(provider, body, signature);
  }
}
