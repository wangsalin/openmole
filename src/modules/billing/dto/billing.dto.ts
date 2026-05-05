import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsNumber,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListFeaturesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'disabled', 'archived'])
  status?: string;
}

export class CreateFeatureDto {
  @IsString()
  featureKey: string;

  @IsString()
  name: string;

  @IsString()
  module: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isMetered?: boolean;

  @IsOptional()
  @IsIn(['active', 'inactive', 'disabled', 'archived'])
  status?: string;
}

export class UpdateFeatureDto {
  @IsOptional()
  @IsString()
  featureKey?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isMetered?: boolean;

  @IsOptional()
  @IsIn(['active', 'inactive', 'disabled', 'archived'])
  status?: string;
}

export class ListPlansDto extends PaginationDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'disabled', 'archived'])
  status?: string;
}

export class CreatePlanDto {
  @IsString()
  appId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMonthly?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceYearly?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  isRecommended?: boolean;

  @IsOptional()
  @IsIn(['active', 'inactive', 'disabled', 'archived'])
  status?: string;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMonthly?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceYearly?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  isRecommended?: boolean;

  @IsOptional()
  @IsIn(['active', 'inactive', 'disabled', 'archived'])
  status?: string;
}

export class AttachPlanFeatureDto {
  @IsString()
  featureId: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  quotaType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quotaLimit?: number;

  @IsOptional()
  @IsString()
  resetCycle?: string;
}

export class ListSubscriptionsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsIn(['active', 'trialing', 'expired', 'cancelled', 'past_due'])
  status?: string;
}

export class CreateSubscriptionDto {
  @IsString()
  appId: string;

  @IsString()
  tenantId: string;

  @IsString()
  planId: string;

  @IsOptional()
  @IsIn(['active', 'trialing', 'expired', 'cancelled', 'past_due'])
  status?: string;

  @Type(() => Date)
  @IsDate()
  startAt: Date;

  @Type(() => Date)
  @IsDate()
  endAt: Date;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}

export class OpenSubscriptionDto {
  @IsString()
  tenantId: string;

  @IsString()
  planId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  months?: number;
}

export class CreateOrderDto {
  @IsString()
  appId: string;

  @IsString()
  tenantId: string;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  orderNo?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class CreateTenantOrderDto {
  @IsString()
  planId: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class StartOrderPaymentDto {
  @IsOptional()
  @IsString()
  provider?: string;
}

export class PaymentWebhookDto {
  @IsString()
  orderNo: string;

  @IsOptional()
  @IsString()
  providerTradeNo?: string;

  @IsIn(['succeeded', 'failed', 'refunded'])
  status: 'succeeded' | 'failed' | 'refunded';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  months?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paidAt?: Date;
}
