import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const commonStatuses = ['active', 'inactive', 'disabled', 'archived'];

export class ListAiProvidersDto extends PaginationDto {
  @IsOptional()
  @IsIn(commonStatuses)
  status?: string;
}

export class CreateAiProviderDto {
  @IsString()
  providerKey: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  secretRef?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class ListAiModelsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsIn(commonStatuses)
  status?: string;

  @IsOptional()
  @IsString()
  modality?: string;
}

export class CreateAiModelDto {
  @IsString()
  providerId: string;

  @IsString()
  modelKey: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  modality?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inputTokenPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  outputTokenPrice?: number;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class CreateAiRouteDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  routeKey: string;

  @IsString()
  primaryModelId: string;

  @IsOptional()
  @IsString()
  fallbackModelId?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class ListAiCallLogsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ListPromptsDto extends PaginationDto {
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

export class CreatePromptDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  promptKey: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreatePromptVersionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;

  @IsString()
  content: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['draft', 'published', 'archived'])
  status?: string;
}

export class PublishPromptDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}
