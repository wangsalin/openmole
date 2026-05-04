import { IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListRolesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'disabled', 'archived'])
  status?: string;
}

export class CreateRoleDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  @Matches(/^[a-z0-9_.-]+$/)
  roleKey: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  dataScope?: string;

  @IsOptional()
  @IsBoolean()
  isBuiltin?: boolean;
}

export class ListPermissionsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'disabled', 'archived'])
  status?: string;
}

export class CreatePermissionDto {
  @IsString()
  @Matches(/^[a-z0-9_.-]+$/)
  permissionKey: string;

  @IsString()
  name: string;

  @IsString()
  module: string;

  @IsString()
  action: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class GrantPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionIds: string[];
}
