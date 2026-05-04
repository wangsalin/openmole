import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListTenantsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsIn(['pending_review', 'active', 'rejected', 'disabled', 'overdue', 'expired'])
  status?: string;
}

export class TenantOwnerDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class CreateTenantDto {
  @IsString()
  appId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  tenantType?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsIn(['pending_review', 'active', 'rejected', 'disabled', 'overdue', 'expired'])
  status?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsBoolean()
  initializeRoles?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantOwnerDto)
  owner?: TenantOwnerDto;
}

export class UpdateTenantDto extends PartialType(CreateTenantDto) {}

export class ListTenantMembersDto extends PaginationDto {
  @IsOptional()
  @IsIn(['active', 'inactive', 'disabled', 'archived'])
  status?: string;
}

export class AddTenantMemberDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsString()
  roleId: string;
}

export class UpdateTenantMemberDto {
  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'disabled', 'archived'])
  status?: string;
}
