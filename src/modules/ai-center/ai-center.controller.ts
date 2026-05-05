import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { CurrentTenantContext } from '../../common/decorators/tenant-context.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  AuthenticatedRequest,
  TenantContext,
} from '../../common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiCenterService } from './ai-center.service';
import {
  CreateAiModelDto,
  CreateAiProviderDto,
  CreateAiRouteDto,
  CreatePromptDto,
  CreatePromptVersionDto,
  ListAiCallLogsDto,
  ListAiModelsDto,
  ListAiProvidersDto,
  ListAiRoutesDto,
  ListPromptsDto,
  PublishPromptDto,
  UpdateAiModelDto,
  UpdateAiProviderDto,
  UpdateAiRouteDto,
} from './dto/ai.dto';
import { OpenAiRequestDto } from './dto/open-ai.dto';

@Controller()
export class AiCenterController {
  constructor(private readonly ai: AiCenterService) {}

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('admin/v1/ai/providers')
  @RequirePermissions('ai.provider.read')
  providers(@Query() query: ListAiProvidersDto) {
    return this.ai.providers(query);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/ai/providers')
  @RequirePermissions('ai.provider.create')
  createProvider(@Body() body: CreateAiProviderDto) {
    return this.ai.createProvider(body);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Patch('admin/v1/ai/providers/:id')
  @RequirePermissions('ai.provider.update')
  updateProvider(@Param('id') id: string, @Body() body: UpdateAiProviderDto) {
    return this.ai.updateProvider(id, body);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/ai/providers/:id/disable')
  @RequirePermissions('ai.provider.update')
  disableProvider(@Param('id') id: string) {
    return this.ai.disableProvider(id);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('admin/v1/ai/models')
  @RequirePermissions('ai.model.read')
  models(@Query() query: ListAiModelsDto) {
    return this.ai.models(query);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/ai/models')
  @RequirePermissions('ai.model.create')
  createModel(@Body() body: CreateAiModelDto) {
    return this.ai.createModel(body);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Patch('admin/v1/ai/models/:id')
  @RequirePermissions('ai.model.update')
  updateModel(@Param('id') id: string, @Body() body: UpdateAiModelDto) {
    return this.ai.updateModel(id, body);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('admin/v1/ai/routes')
  @RequirePermissions('ai.route.read')
  routes(
    @Query() query: ListAiRoutesDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.ai.routes(query, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/ai/routes')
  @RequirePermissions('ai.route.create')
  createRoute(
    @Body() body: CreateAiRouteDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.ai.createRoute(body, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Patch('admin/v1/ai/routes/:id')
  @RequirePermissions('ai.route.update')
  updateRoute(
    @Param('id') id: string,
    @Body() body: UpdateAiRouteDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.ai.updateRoute(id, body, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('admin/v1/prompts')
  @RequirePermissions('ai.prompt.read')
  prompts(
    @Query() query: ListPromptsDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.ai.prompts(query, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/prompts')
  @RequirePermissions('ai.prompt.create')
  createPrompt(
    @Body() body: CreatePromptDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.ai.createPrompt(body, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('admin/v1/prompts/:id/versions')
  @RequirePermissions('ai.prompt.read')
  promptVersions(
    @Param('id') promptId: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.ai.promptVersions(promptId, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/prompts/:id/versions')
  @RequirePermissions('ai.prompt.version.create')
  createPromptVersion(
    @Param('id') promptId: string,
    @Body() body: CreatePromptVersionDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.ai.createPromptVersion(promptId, body, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/prompts/:id/publish')
  @RequirePermissions('ai.prompt.publish')
  publishPrompt(
    @Param('id') promptId: string,
    @Body() body: PublishPromptDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.ai.publishPrompt(promptId, body.version, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('admin/v1/ai/calls')
  @RequirePermissions('ai.call.read')
  callLogs(
    @Query() query: ListAiCallLogsDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.ai.callLogs(query, tenantContext);
  }

  @RateLimit({ name: 'open.ai.chat', limit: 60, windowSec: 60 })
  @Post('open/v1/ai/chat')
  chat(@Body() body: OpenAiRequestDto, @Req() request: AuthenticatedRequest) {
    return this.ai.openAiCall('chat', body, request);
  }

  @RateLimit({ name: 'open.ai.generate', limit: 60, windowSec: 60 })
  @Post('open/v1/ai/generate')
  generate(@Body() body: OpenAiRequestDto, @Req() request: AuthenticatedRequest) {
    return this.ai.openAiCall('generate', body, request);
  }
}
