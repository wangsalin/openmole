import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ALLOWED_API_KEY_SCOPES } from '../api-key-scopes';
import { ALLOWED_WEBHOOK_EVENTS } from '../webhook-events';

const commonStatuses = ['active', 'inactive', 'disabled', 'archived'];

export class ListApiKeysDto extends PaginationDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsIn(commonStatuses)
  status?: string;
}

export class CreateApiKeyDto {
  @IsString()
  appId: string;

  @IsString()
  tenantId: string;

  @IsString()
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ALLOWED_API_KEY_SCOPES, { each: true })
  scopes: string[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}

export class ListWebhooksDto extends PaginationDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsIn(commonStatuses)
  status?: string;
}

export class CreateWebhookDto {
  @IsString()
  appId: string;

  @IsString()
  tenantId: string;

  @IsString()
  name: string;

  @IsUrl({ require_tld: false })
  url: string;

  @IsOptional()
  @IsString()
  secretRef?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ALLOWED_WEBHOOK_EVENTS, { each: true })
  events: string[];
}

export class ListWebhookDeliveriesDto extends PaginationDto {
  @IsOptional()
  @IsIn(['pending', 'succeeded', 'failed'])
  status?: string;
}
