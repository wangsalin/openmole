import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListSettingsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  key?: string;
}

export class UpsertSettingDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  key: string;

  @IsObject()
  value: Record<string, unknown>;

  @IsOptional()
  @IsString()
  scope?: string;
}

export class ListDictItemsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  dictKey?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'disabled', 'archived'])
  status?: string;
}

export class CreateDictItemDto {
  @IsString()
  dictKey: string;

  @IsString()
  itemKey: string;

  @IsString()
  label: string;

  @IsString()
  value: string;
}
