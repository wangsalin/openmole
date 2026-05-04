import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const commonStatuses = ['active', 'inactive', 'disabled', 'archived'];

export class ListKnowledgeBasesDto extends PaginationDto {
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

export class CreateKnowledgeBaseDto {
  @IsString()
  appId: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  visibility?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class AddKnowledgeFileDto {
  @IsOptional()
  @IsString()
  bucket?: string;

  @IsOptional()
  @IsString()
  objectKey?: string;

  @IsString()
  fileName: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  hash?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  chunks?: string[];
}

export class OpenRagQueryDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsString()
  knowledgeBaseId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  topK?: number;
}
