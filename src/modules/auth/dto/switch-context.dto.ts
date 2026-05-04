import { IsOptional, IsString } from 'class-validator';

export class SwitchContextDto {
  @IsString()
  appId: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}
