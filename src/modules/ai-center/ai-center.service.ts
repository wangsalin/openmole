import {
  BadRequestException,
  BadGatewayException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKey, AiModel, AiModelRoute, AiProvider } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { buildPagination, omitUndefined } from '../../common/prisma-list';
import { tenantScopedQuery } from '../../common/tenant-scope';
import {
  AuthenticatedRequest,
  TenantContext,
} from '../../common/types/authenticated-request';
import { WebhookDeliveryService } from '../developer/webhook-delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsageService } from '../usage/usage.service';
import { AiProviderAdapter, AiProviderResult } from './ai-provider.adapter';
import {
  CreateAiModelDto,
  CreateAiProviderDto,
  CreateAiRouteDto,
  CreatePromptDto,
  CreatePromptVersionDto,
  ListAiCallLogsDto,
  ListAiModelsDto,
  ListAiProvidersDto,
  ListPromptsDto,
} from './dto/ai.dto';
import { OpenAiRequestDto } from './dto/open-ai.dto';

@Injectable()
export class AiCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
    private readonly adapter: AiProviderAdapter,
    private readonly webhookDelivery: WebhookDeliveryService,
  ) {}

  providers(query: ListAiProvidersDto) {
    const { skip, take } = buildPagination(query);
    return this.prisma.aiProvider.findMany({
      where: omitUndefined({ status: query.status }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  createProvider(body: CreateAiProviderDto) {
    return this.prisma.aiProvider.create({ data: body as never });
  }

  async disableProvider(id: string) {
    const provider = await this.prisma.aiProvider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('AI provider not found');
    const activeModelCount = await this.prisma.aiModel.count({
      where: {
        providerId: id,
        status: { in: ['active', 'inactive'] },
      },
    });
    if (activeModelCount > 0) {
      throw new BadRequestException('AI provider is still referenced by models');
    }
    return this.prisma.aiProvider.update({
      where: { id },
      data: { status: 'disabled' },
    });
  }

  models(query: ListAiModelsDto) {
    const { skip, take } = buildPagination(query);
    return this.prisma.aiModel.findMany({
      where: omitUndefined({
        providerId: query.providerId,
        status: query.status,
        modality: query.modality,
      }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createModel(body: CreateAiModelDto) {
    const provider = await this.prisma.aiProvider.findUnique({
      where: { id: body.providerId },
    });
    if (!provider) throw new BadRequestException('AI provider not found');
    if (provider.status !== 'active') {
      throw new BadRequestException('AI provider is not active');
    }
    return this.prisma.aiModel.create({ data: body as never });
  }

  async createRoute(body: CreateAiRouteDto, tenantContext?: TenantContext) {
    const primaryModel = await this.prisma.aiModel.findUnique({
      where: { id: body.primaryModelId },
    });
    if (!primaryModel) throw new BadRequestException('Primary AI model not found');
    if (primaryModel.status !== 'active') {
      throw new BadRequestException('Primary AI model is not active');
    }

    if (body.fallbackModelId) {
      const fallbackModel = await this.prisma.aiModel.findUnique({
        where: { id: body.fallbackModelId },
      });
      if (!fallbackModel) {
        throw new BadRequestException('Fallback AI model not found');
      }
      if (fallbackModel.status !== 'active') {
        throw new BadRequestException('Fallback AI model is not active');
      }
    }

    const scope = await this.resolveAdminScope(body, tenantContext);
    const appId = scope.appId;
    const tenantId = scope.tenantId;
    await this.ensureAppTenant(appId, tenantId);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.aiModelRoute.findFirst({
        where: { appId, tenantId, routeKey: body.routeKey },
      });
      if (existing) {
        return tx.aiModelRoute.update({
          where: { id: existing.id },
          data: {
            primaryModelId: body.primaryModelId,
            fallbackModelId: body.fallbackModelId,
            config: body.config as never,
            status: 'active',
          },
        });
      }
      return tx.aiModelRoute.create({
        data: {
          appId,
          tenantId,
          routeKey: body.routeKey,
          primaryModelId: body.primaryModelId,
          fallbackModelId: body.fallbackModelId,
          config: body.config as never,
        },
      });
    });
  }

  prompts(query: ListPromptsDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    return this.prisma.prompt.findMany({
      where: omitUndefined({
        appId: tenantContext?.isPlatform
          ? query.appId
          : tenantContext?.appId ?? query.appId,
        tenantId: tenantContext?.isPlatform
          ? query.tenantId
          : tenantContext?.tenantId ?? query.tenantId,
        status: query.status,
      }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPrompt(body: CreatePromptDto, tenantContext?: TenantContext) {
    const scope = await this.resolveAdminScope(body, tenantContext);
    await this.ensureAppTenant(scope.appId, scope.tenantId);
    return this.prisma.prompt.create({
      data: {
        appId: scope.appId,
        tenantId: scope.tenantId,
        promptKey: body.promptKey,
        name: body.name,
        description: body.description,
      },
    });
  }

  async promptVersions(promptId: string, tenantContext?: TenantContext) {
    await this.findPromptForAdmin(promptId, tenantContext);
    return this.prisma.promptVersion.findMany({
      where: { promptId },
      orderBy: { version: 'desc' },
    });
  }

  async createPromptVersion(
    promptId: string,
    body: CreatePromptVersionDto,
    tenantContext?: TenantContext,
  ) {
    await this.findPromptForAdmin(promptId, tenantContext);
    const version =
      body.version ??
      ((await this.prisma.promptVersion.aggregate({
        where: { promptId },
        _max: { version: true },
      }))._max.version ?? 0) + 1;
    return this.prisma.promptVersion.create({
      data: {
        promptId,
        version,
        content: body.content,
        variables: body.variables as never,
        status: body.status ?? 'draft',
      },
    });
  }

  async publishPrompt(
    promptId: string,
    version: number,
    tenantContext?: TenantContext,
  ) {
    await this.findPromptForAdmin(promptId, tenantContext);
    const promptVersion = await this.prisma.promptVersion.findUnique({
      where: { promptId_version: { promptId, version } },
    });
    if (!promptVersion) throw new BadRequestException('Prompt version not found');
    return this.prisma.$transaction(async (tx) => {
      await tx.promptVersion.updateMany({
        where: { promptId },
        data: { status: 'archived' },
      });
      await tx.promptVersion.update({
        where: { promptId_version: { promptId, version } },
        data: { status: 'published' },
      });
      return tx.prompt.update({
        where: { id: promptId },
        data: { currentVersion: version, status: 'active' },
      });
    });
  }

  callLogs(query: ListAiCallLogsDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scope = tenantScopedQuery(query, tenantContext);
    return this.prisma.aiCallLog.findMany({
      where: omitUndefined({
        appId: scope.appId,
        tenantId: scope.tenantId,
        status: query.status,
      }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async openAiCall(
    kind: 'chat' | 'generate',
    body: OpenAiRequestDto,
    request: AuthenticatedRequest,
  ) {
    const startedAt = Date.now();
    const apiKey = await this.authenticateApiKey(request, `ai:${kind}`);
    if (!apiKey.tenantId) {
      throw new ForbiddenException('AI open API requires a tenant-bound API key');
    }

    const routeKey = body.routeKey ?? kind;
    const effectiveBody = body.promptKey
      ? await this.applyPromptTemplate(body, apiKey, kind)
      : body;
    const quantity = body.quantity ?? 1;
    const entitlement = await this.usage.checkEntitlement({
      tenantId: apiKey.tenantId,
      featureKey: 'ai_text_generate',
      metric: 'count',
      quantity,
    });

    if (!entitlement.allowed) {
      const log = await this.writeAiCallLog({
        apiKey,
        routeKey,
        promptKey: body.promptKey,
        status: 'rejected',
        latencyMs: Date.now() - startedAt,
        errorMessage: String(entitlement.reason),
        tokenEstimate: this.estimateTokens(effectiveBody),
      });
      await this.webhookDelivery.dispatch({
        appId: apiKey.appId,
        tenantId: apiKey.tenantId,
        eventType: 'usage.quota.exceeded',
        payload: {
          aiCallLogId: log.id,
          routeKey,
          featureKey: 'ai_text_generate',
          reason: entitlement.reason,
          requested: quantity,
          remaining: entitlement.remaining,
        },
      });
      throw new ForbiddenException(entitlement.reason);
    }

    const route = await this.resolveRoute(apiKey.appId, apiKey.tenantId, routeKey);
    if (!route) {
      await this.writeAiCallLog({
        apiKey,
        routeKey,
        promptKey: body.promptKey,
        status: 'failed',
        latencyMs: Date.now() - startedAt,
        errorMessage: 'ai_route_not_configured',
        tokenEstimate: this.estimateTokens(effectiveBody),
      });
      throw new BadRequestException('AI route is not configured');
    }

    const modelInfo = await this.resolveModel(route.primaryModelId);
    let providerResult: AiProviderResult;
    try {
      providerResult = await this.adapter.callOpenAiCompatible({
        kind,
        provider: modelInfo.provider,
        model: modelInfo.model,
        body: effectiveBody,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI provider failed';
      const failedLog = await this.writeAiCallLog({
        apiKey,
        routeKey,
        promptKey: body.promptKey,
        providerKey: modelInfo.provider.providerKey,
        modelKey: modelInfo.model.modelKey,
        status: 'failed',
        latencyMs: Date.now() - startedAt,
        errorMessage: message,
        tokenEstimate: this.estimateTokens(effectiveBody),
      });
      await this.webhookDelivery.dispatch({
        appId: apiKey.appId,
        tenantId: apiKey.tenantId,
        eventType: 'ai.call.failed',
        payload: {
          aiCallLogId: failedLog.id,
          routeKey,
          providerKey: modelInfo.provider.providerKey,
          modelKey: modelInfo.model.modelKey,
          errorMessage: message,
        },
      });
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(message);
    }

    const fallbackTokens = this.estimateTokens(effectiveBody);
    const log = await this.writeAiCallLog({
      apiKey,
      routeKey,
      promptKey: body.promptKey,
      providerKey: modelInfo.provider.providerKey,
      modelKey: modelInfo.model.modelKey,
      status: 'succeeded',
      latencyMs: Date.now() - startedAt,
      requestTokens: providerResult.requestTokens ?? fallbackTokens,
      responseTokens: providerResult.responseTokens,
      totalTokens:
        providerResult.totalTokens ??
        (providerResult.requestTokens ?? fallbackTokens) +
          (providerResult.responseTokens ?? 0),
    });

    const usage = await this.usage.record({
      appId: apiKey.appId,
      tenantId: apiKey.tenantId,
      featureKey: 'ai_text_generate',
      metric: 'count',
      quantity,
      sourceType: 'ai_call',
      sourceId: log.id,
    });
    await this.webhookDelivery.dispatch({
      appId: apiKey.appId,
      tenantId: apiKey.tenantId,
      eventType: 'ai.call.succeeded',
      payload: {
        aiCallLogId: log.id,
        routeKey,
        providerKey: modelInfo.provider.providerKey,
        modelKey: modelInfo.model.modelKey,
        usageLedgerId: usage.ledger.id,
        totalTokens: log.totalTokens,
      },
    });

    return {
      id: log.id,
      status: 'succeeded',
      routeKey,
      providerKey: modelInfo.provider.providerKey,
      modelKey: modelInfo.model.modelKey,
      usage: {
        ledgerId: usage.ledger.id,
        quotaUpdated: usage.quotaUpdated,
      },
      entitlement: {
        remainingBeforeCall: entitlement.remaining,
      },
      output: providerResult.output,
    };
  }

  private async authenticateApiKey(
    request: AuthenticatedRequest,
    requiredScope: string,
  ) {
    const rawKey = this.extractApiKey(request);
    if (!rawKey) throw new UnauthorizedException('Missing API key');

    const keyPrefix = rawKey.slice(0, 10);
    const candidates = await this.prisma.apiKey.findMany({
      where: { keyPrefix, status: 'active' },
    });
    for (const candidate of candidates) {
      const matched = await bcrypt.compare(rawKey, candidate.keyHash);
      if (!matched) continue;
      if (candidate.expiresAt && candidate.expiresAt < new Date()) {
        throw new UnauthorizedException('API key expired');
      }
      this.assertScope(candidate, requiredScope);
      await this.prisma.apiKey.update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date() },
      });
      return candidate;
    }

    throw new UnauthorizedException('Invalid API key');
  }

  private extractApiKey(request: AuthenticatedRequest) {
    const direct = request.headers['x-api-key'];
    if (typeof direct === 'string' && direct) return direct;
    const authorization = request.headers.authorization;
    if (typeof authorization === 'string') {
      const [scheme, token] = authorization.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token) return token;
    }
    return undefined;
  }

  private assertScope(apiKey: ApiKey, requiredScope: string) {
    if (
      apiKey.scopes.includes(requiredScope) ||
      apiKey.scopes.includes('ai:*') ||
      apiKey.scopes.includes('*')
    ) {
      return;
    }
    throw new ForbiddenException('API key scope is not allowed');
  }

  private async resolveAdminScope(
    body: { appId?: string; tenantId?: string },
    tenantContext?: TenantContext,
  ) {
    const appId = tenantContext?.isPlatform
      ? body.appId ?? null
      : tenantContext?.appId ?? body.appId ?? null;
    const tenantId = tenantContext?.isPlatform
      ? body.tenantId ?? null
      : tenantContext?.tenantId ?? body.tenantId ?? null;
    if (tenantId && !appId) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new BadRequestException('Tenant not found');
      return { appId: tenant.appId, tenantId };
    }
    return { appId, tenantId };
  }

  private async ensureAppTenant(appId: string | null, tenantId: string | null) {
    if (appId) {
      const app = await this.prisma.app.findUnique({ where: { id: appId } });
      if (!app) throw new BadRequestException('App not found');
    }
    if (!tenantId) return;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Tenant not found');
    if (appId && tenant.appId !== appId) {
      throw new BadRequestException('Tenant belongs to another app');
    }
  }

  private async findPromptForAdmin(promptId: string, tenantContext?: TenantContext) {
    const prompt = await this.prisma.prompt.findUnique({ where: { id: promptId } });
    if (!prompt) throw new NotFoundException('Prompt not found');
    if (
      tenantContext &&
      !tenantContext.isPlatform &&
      (prompt.appId !== tenantContext.appId ||
        prompt.tenantId !== tenantContext.tenantId)
    ) {
      throw new ForbiddenException('Prompt is outside tenant context');
    }
    return prompt;
  }

  private async applyPromptTemplate(
    body: OpenAiRequestDto,
    apiKey: ApiKey,
    kind: 'chat' | 'generate',
  ): Promise<OpenAiRequestDto> {
    const prompt = await this.resolvePrompt(apiKey, body.promptKey as string);
    if (!prompt) throw new BadRequestException('Prompt is not configured');
    const promptVersion = await this.resolvePromptVersion(prompt);
    if (!promptVersion) throw new BadRequestException('Published prompt version not found');
    const rendered = this.renderPrompt(promptVersion.content, body.variables ?? {});
    if (kind === 'chat') {
      return {
        ...body,
        messages: [
          { role: 'system', content: rendered },
          ...(body.messages?.length
            ? body.messages
            : [{ role: 'user', content: body.input ?? '' }]),
        ],
      };
    }
    return {
      ...body,
      input: body.input ? `${rendered}\n\n${body.input}` : rendered,
    };
  }

  private async resolvePrompt(apiKey: ApiKey, promptKey: string) {
    const prompts = await this.prisma.prompt.findMany({
      where: {
        promptKey,
        status: 'active',
        OR: [
          { appId: apiKey.appId, tenantId: apiKey.tenantId },
          { appId: apiKey.appId, tenantId: null },
          { appId: null, tenantId: null },
        ],
      },
    });
    return (
      prompts.find(
        (prompt) => prompt.appId === apiKey.appId && prompt.tenantId === apiKey.tenantId,
      ) ??
      prompts.find((prompt) => prompt.appId === apiKey.appId && prompt.tenantId === null) ??
      prompts.find((prompt) => prompt.appId === null && prompt.tenantId === null) ??
      null
    );
  }

  private async resolvePromptVersion(prompt: {
    id: string;
    currentVersion: number | null;
  }) {
    if (prompt.currentVersion) {
      return this.prisma.promptVersion.findFirst({
        where: {
          promptId: prompt.id,
          version: prompt.currentVersion,
          status: 'published',
        },
      });
    }
    return this.prisma.promptVersion.findFirst({
      where: { promptId: prompt.id, status: 'published' },
      orderBy: { version: 'desc' },
    });
  }

  private renderPrompt(content: string, variables: Record<string, unknown>) {
    return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
      const value = key
        .split('.')
        .reduce<unknown>(
          (current, segment) =>
            current && typeof current === 'object'
              ? (current as Record<string, unknown>)[segment]
              : undefined,
          variables,
        );
      if (value === undefined || value === null) return '';
      return typeof value === 'string' ? value : JSON.stringify(value);
    });
  }

  private async resolveRoute(
    appId: string,
    tenantId: string,
    routeKey: string,
  ): Promise<AiModelRoute | null> {
    const routes = await this.prisma.aiModelRoute.findMany({
      where: {
        routeKey,
        status: 'active',
        OR: [
          { appId, tenantId },
          { appId, tenantId: null },
          { appId: null, tenantId: null },
        ],
      },
    });
    return (
      routes.find((route) => route.appId === appId && route.tenantId === tenantId) ??
      routes.find((route) => route.appId === appId && route.tenantId === null) ??
      routes.find((route) => route.appId === null && route.tenantId === null) ??
      null
    );
  }

  private async resolveModel(
    modelId: string,
  ): Promise<{ model: AiModel; provider: AiProvider }> {
    const model = await this.prisma.aiModel.findUnique({ where: { id: modelId } });
    if (!model) throw new BadRequestException('AI route primary model not found');
    const provider = await this.prisma.aiProvider.findUnique({
      where: { id: model.providerId },
    });
    if (!provider) throw new BadRequestException('AI model provider not found');
    if (provider.status !== 'active' || model.status !== 'active') {
      throw new BadRequestException('AI provider or model is inactive');
    }
    return { model, provider };
  }

  private estimateTokens(body: OpenAiRequestDto) {
    const content = JSON.stringify({
      input: body.input,
      messages: body.messages,
      variables: body.variables,
      promptKey: body.promptKey,
    });
    return Math.max(1, Math.ceil(content.length / 4));
  }

  private writeAiCallLog(input: {
    apiKey: ApiKey;
    routeKey?: string;
    promptKey?: string;
    providerKey?: string;
    modelKey?: string;
    status: string;
    latencyMs: number;
    errorMessage?: string;
    tokenEstimate?: number;
    requestTokens?: number;
    responseTokens?: number;
    totalTokens?: number;
  }) {
    return this.prisma.aiCallLog.create({
      data: {
        appId: input.apiKey.appId,
        tenantId: input.apiKey.tenantId,
        routeKey: input.routeKey,
        promptKey: input.promptKey,
        providerKey: input.providerKey,
        modelKey: input.modelKey,
        requestTokens: input.requestTokens ?? input.tokenEstimate,
        responseTokens: input.responseTokens,
        totalTokens: input.totalTokens ?? input.tokenEstimate,
        latencyMs: input.latencyMs,
        status: input.status,
        errorMessage: input.errorMessage,
      },
    });
  }
}
