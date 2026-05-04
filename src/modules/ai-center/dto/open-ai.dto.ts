import { IsArray, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class OpenAiRequestDto {
  @IsOptional()
  @IsString()
  routeKey?: string;

  @IsOptional()
  @IsString()
  promptKey?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  input?: string;

  @IsOptional()
  @IsArray()
  messages?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
