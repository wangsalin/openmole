import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListUsageLedgerDto extends PaginationDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  featureKey?: string;
}

export class CreateUsageLedgerDto {
  @IsString()
  appId: string;

  @IsString()
  tenantId: string;

  @IsString()
  featureKey: string;

  @IsString()
  metric: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  costAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  chargeAmount?: number;
}

export class CheckEntitlementDto {
  @IsString()
  tenantId: string;

  @IsString()
  featureKey: string;

  @IsOptional()
  @IsString()
  metric?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;
}
