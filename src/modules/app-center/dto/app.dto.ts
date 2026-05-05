import { PartialType } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListAppsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  appType?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'disabled', 'archived'])
  status?: string;
}

export class CreateAppDto {
  @IsString()
  name: string;

  @IsString()
  @Matches(/^[a-z0-9_-]+$/)
  appKey: string;

  @IsString()
  appType: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'disabled', 'archived'])
  status?: string;

  @IsOptional()
  @IsString()
  defaultPlanId?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateAppDto extends PartialType(CreateAppDto) {}
