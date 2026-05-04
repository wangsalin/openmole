import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKey, FileAsset, KnowledgeBase, KnowledgeChunk } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, createHmac } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';
import { buildPagination, omitUndefined } from '../../common/prisma-list';
import {
  assertTenantScopedAccess,
  requireTenantWriteScope,
  tenantScopedQuery,
} from '../../common/tenant-scope';
import {
  AuthenticatedRequest,
  TenantContext,
} from '../../common/types/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddKnowledgeFileDto,
  CreateKnowledgeBaseDto,
  ListKnowledgeBasesDto,
  OpenRagQueryDto,
} from './dto/knowledge.dto';

const DEFAULT_KNOWLEDGE_MAX_PARSE_BYTES = 10 * 1024 * 1024;
const DEFAULT_KNOWLEDGE_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_KNOWLEDGE_PARSE_TIMEOUT_MS = 20_000;
const DEFAULT_KNOWLEDGE_QUEUE_ATTEMPTS = 3;
const DEFAULT_KNOWLEDGE_QUEUE_BACKOFF_MS = 5_000;

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue('knowledge') private readonly knowledgeQueue: Queue,
  ) {}

  bases(query: ListKnowledgeBasesDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scope = tenantScopedQuery(query, tenantContext);
    return this.prisma.knowledgeBase.findMany({
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

  async createBase(body: CreateKnowledgeBaseDto, tenantContext?: TenantContext) {
    const scope = this.resolveKnowledgeWriteScope(body, tenantContext);
    await this.ensureAppTenant(scope.appId, scope.tenantId);
    return this.prisma.knowledgeBase.create({
      data: {
        appId: scope.appId,
        tenantId: scope.tenantId,
        name: body.name,
        description: body.description,
        visibility: body.visibility ?? 'tenant',
        config: body.config as never,
      },
    });
  }

  async addFile(
    knowledgeBaseId: string,
    body: AddKnowledgeFileDto,
    tenantContext?: TenantContext,
  ) {
    this.assertAddFileWithinLimit(body);
    const knowledgeBase = await this.findBaseOrThrow(knowledgeBaseId);
    assertTenantScopedAccess(
      knowledgeBase,
      tenantContext,
      'Knowledge base is outside tenant context',
    );
    const chunks = body.chunks?.length
      ? body.chunks
      : body.content
        ? this.splitText(body.content)
        : [];
    const chunkEmbeddings = await Promise.all(
      chunks.map(async (content) => ({
        content,
        embedding: await this.embedForScope(
          knowledgeBase.appId,
          knowledgeBase.tenantId,
          content,
        ),
      })),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const file = await tx.fileAsset.create({
        data: {
          appId: knowledgeBase.appId,
          tenantId: knowledgeBase.tenantId,
          bucket: body.bucket ?? 'inline',
          objectKey:
            body.objectKey ??
            `inline/${knowledgeBase.id}/${Date.now()}-${body.fileName}`,
          fileName: body.fileName,
          mimeType: body.mimeType,
          sizeBytes: body.sizeBytes ?? body.content?.length ?? 0,
          hash: body.hash,
          metadata: body.metadata as never,
        },
      });

      const knowledgeFile = await tx.knowledgeFile.create({
        data: {
          appId: knowledgeBase.appId,
          tenantId: knowledgeBase.tenantId,
          knowledgeBaseId,
          fileId: file.id,
          parseStatus: chunks.length ? 'succeeded' : 'pending',
        },
      });

      if (chunkEmbeddings.length) {
        for (const [index, item] of chunkEmbeddings.entries()) {
          const chunk = await tx.knowledgeChunk.create({
            data: {
              appId: knowledgeBase.appId,
              tenantId: knowledgeBase.tenantId,
              knowledgeBaseId,
              knowledgeFileId: knowledgeFile.id,
              chunkIndex: index,
              content: item.content,
              embedding: item.embedding,
              metadata: {
                fileId: file.id,
                fileName: file.fileName,
              },
            } as never,
          });
          await tx.$executeRaw`
            UPDATE "knowledge_chunks"
            SET "embedding_vector" = ${this.toVectorLiteral(item.embedding)}::vector
            WHERE "id" = ${chunk.id}
          `;
        }
      }

      if (!chunks.length) {
        const task = await tx.task.create({
          data: {
            appId: knowledgeBase.appId,
            tenantId: knowledgeBase.tenantId,
            taskType: 'knowledge.parse_file',
            status: 'pending',
            payload: {
              knowledgeBaseId,
              knowledgeFileId: knowledgeFile.id,
              fileId: file.id,
            },
          },
        });
        return { file, knowledgeFile, chunksCreated: 0, taskId: task.id };
      }

      return { file, knowledgeFile, chunksCreated: chunks.length };
    });

    if (!chunks.length) {
      await this.knowledgeQueue.add(
        'parse-file',
        {
          knowledgeBaseId,
          knowledgeFileId: result.knowledgeFile.id,
          fileId: result.file.id,
          taskId: result.taskId,
        },
        this.knowledgeJobOptions(),
      );
    }
    return result;
  }

  async enqueueRebuild(
    knowledgeBaseId: string,
    tenantContext?: TenantContext,
  ) {
    const knowledgeBase = await this.findBaseOrThrow(knowledgeBaseId);
    assertTenantScopedAccess(
      knowledgeBase,
      tenantContext,
      'Knowledge base is outside tenant context',
    );
    const task = await this.prisma.task.create({
      data: {
        appId: knowledgeBase.appId,
        tenantId: knowledgeBase.tenantId,
        taskType: 'knowledge.rebuild_index',
        status: 'pending',
        payload: { knowledgeBaseId },
      },
    });
    const job = await this.knowledgeQueue.add(
      'rebuild-index',
      {
        knowledgeBaseId,
        taskId: task.id,
      },
      this.knowledgeJobOptions(),
    );
    await this.prisma.task.update({
      where: { id: task.id },
      data: { payload: { knowledgeBaseId, jobId: job.id } },
    });
    return { jobId: job.id, taskId: task.id };
  }

  async parseQueuedFile(input: {
    knowledgeBaseId: string;
    knowledgeFileId: string;
    fileId: string;
    taskId?: string;
  }) {
    await this.markTaskRunning(input.taskId);
    try {
      const [knowledgeBase, knowledgeFile, file] = await Promise.all([
        this.findBaseOrThrow(input.knowledgeBaseId),
        this.prisma.knowledgeFile.findUnique({
          where: { id: input.knowledgeFileId },
        }),
        this.prisma.fileAsset.findUnique({ where: { id: input.fileId } }),
      ]);
      if (!knowledgeFile) throw new NotFoundException('Knowledge file not found');
      if (!file) throw new NotFoundException('File asset not found');
      const text = await this.loadText(file);
      const chunks = this.splitText(text);
      if (!chunks.length) throw new BadRequestException('Parsed file is empty');
      await this.replaceChunks(knowledgeBase, knowledgeFile.id, file, chunks);
      await this.prisma.knowledgeFile.update({
        where: { id: knowledgeFile.id },
        data: { parseStatus: 'succeeded', errorMessage: null },
      });
      await this.markTaskSucceeded(input.taskId, { chunksCreated: chunks.length });
      return { chunksCreated: chunks.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Parse failed';
      await this.prisma.knowledgeFile.update({
        where: { id: input.knowledgeFileId },
        data: { parseStatus: 'failed', errorMessage: message },
      });
      await this.markTaskFailed(input.taskId, message);
      throw error;
    }
  }

  async rebuildQueuedIndex(input: { knowledgeBaseId: string; taskId?: string }) {
    await this.markTaskRunning(input.taskId);
    try {
      const knowledgeBase = await this.findBaseOrThrow(input.knowledgeBaseId);
      const chunks = await this.prisma.knowledgeChunk.findMany({
        where: { knowledgeBaseId: input.knowledgeBaseId },
        select: { id: true, content: true },
      });
      for (const chunk of chunks) {
        const embedding = await this.embedForScope(
          knowledgeBase.appId,
          knowledgeBase.tenantId,
          chunk.content,
        );
        await this.prisma.knowledgeChunk.update({
          where: { id: chunk.id },
          data: { embedding: embedding as never },
        });
        await this.prisma.$executeRaw`
          UPDATE "knowledge_chunks"
          SET "embedding_vector" = ${this.toVectorLiteral(embedding)}::vector
          WHERE "id" = ${chunk.id}
        `;
      }
      await this.markTaskSucceeded(input.taskId, { chunksRebuilt: chunks.length });
      return { chunksRebuilt: chunks.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Rebuild failed';
      await this.markTaskFailed(input.taskId, message);
      throw error;
    }
  }

  async ragQuery(
    body: OpenRagQueryDto,
    request: AuthenticatedRequest,
    requiredScope: 'rag:query' | 'knowledge:query',
  ) {
    const startedAt = Date.now();
    const apiKey = await this.authenticateApiKey(request, requiredScope);
    if (!apiKey.tenantId) {
      throw new ForbiddenException('RAG open API requires a tenant-bound API key');
    }
    const query = body.query.trim();
    if (!query) throw new BadRequestException('Query is required');

    const knowledgeBase = body.knowledgeBaseId
      ? await this.findBaseForApiKey(body.knowledgeBaseId, apiKey)
      : null;
    const chunks: Array<KnowledgeChunk & { score?: number }> = await this.searchChunks({
      apiKey,
      knowledgeBaseId: knowledgeBase?.id,
      query,
      topK: body.topK ?? 5,
    });
    const sources = chunks.map((chunk) => ({
      knowledgeBaseId: chunk.knowledgeBaseId,
      knowledgeFileId: chunk.knowledgeFileId,
      chunkId: chunk.id,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      score: chunk.score ?? this.scoreChunk(query, chunk.content),
      metadata: chunk.metadata,
    }));
    const log = await this.prisma.ragQueryLog.create({
      data: {
        appId: apiKey.appId,
        tenantId: apiKey.tenantId,
        knowledgeBaseId: knowledgeBase?.id,
        query,
        matchedChunks: sources as never,
        latencyMs: Date.now() - startedAt,
      },
    });

    return {
      id: log.id,
      status: 'succeeded',
      answer: this.buildExtractiveAnswer(sources),
      sources,
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
      apiKey.scopes.includes('rag:query') ||
      apiKey.scopes.includes('rag:*') ||
      apiKey.scopes.includes('knowledge:query')
    ) {
      return;
    }
    throw new ForbiddenException('API key scope is not allowed');
  }

  private async ensureAppTenant(appId: string, tenantId: string | null) {
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new BadRequestException('App not found');
    if (!tenantId) return;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Tenant not found');
    if (tenant.appId !== appId) {
      throw new BadRequestException('Tenant belongs to another app');
    }
  }

  private resolveKnowledgeWriteScope(
    body: { appId: string; tenantId?: string },
    tenantContext?: TenantContext,
  ) {
    if (tenantContext?.isPlatform) {
      return { appId: body.appId, tenantId: body.tenantId ?? null };
    }
    return requireTenantWriteScope(tenantContext);
  }

  private async findBaseOrThrow(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
    });
    if (!knowledgeBase) throw new NotFoundException('Knowledge base not found');
    return knowledgeBase;
  }

  private async findBaseForApiKey(id: string, apiKey: ApiKey) {
    const knowledgeBase = await this.findBaseOrThrow(id);
    if (
      knowledgeBase.appId !== apiKey.appId ||
      (knowledgeBase.tenantId && knowledgeBase.tenantId !== apiKey.tenantId)
    ) {
      throw new ForbiddenException('Knowledge base is outside API key scope');
    }
    return knowledgeBase;
  }

  private async searchChunks(input: {
    apiKey: ApiKey;
    knowledgeBaseId?: string;
    query: string;
    topK: number;
  }) {
    const vectorChunks = await this.searchVectorChunks(input);
    if (vectorChunks.length) return vectorChunks;

    const terms = this.queryTerms(input.query);
    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: {
        appId: input.apiKey.appId,
        tenantId: input.apiKey.tenantId,
        knowledgeBaseId: input.knowledgeBaseId,
        OR: terms.map((term) => ({
          content: { contains: term, mode: 'insensitive' },
        })),
      },
      take: Math.min(Math.max(input.topK * 4, input.topK), 40),
      orderBy: { createdAt: 'desc' },
    });
    return chunks
      .sort(
        (left, right) =>
          this.scoreChunk(input.query, right.content) -
          this.scoreChunk(input.query, left.content),
      )
      .slice(0, input.topK);
  }

  private async searchVectorChunks(input: {
    apiKey: ApiKey;
    knowledgeBaseId?: string;
    query: string;
    topK: number;
  }): Promise<Array<KnowledgeChunk & { score?: number }>> {
    const vector = this.toVectorLiteral(
      await this.embedForScope(input.apiKey.appId, input.apiKey.tenantId, input.query),
    );
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          appId: string;
          tenantId: string | null;
          knowledgeBaseId: string;
          knowledgeFileId: string | null;
          chunkIndex: number;
          content: string;
          embedding: unknown;
          metadata: unknown;
          createdAt: Date;
          score: number;
        }>
      >`
        SELECT
          "id",
          "app_id" AS "appId",
          "tenant_id" AS "tenantId",
          "knowledge_base_id" AS "knowledgeBaseId",
          "knowledge_file_id" AS "knowledgeFileId",
          "chunk_index" AS "chunkIndex",
          "content",
          "embedding",
          "metadata",
          "created_at" AS "createdAt",
          1 - ("embedding_vector" <=> ${vector}::vector) AS "score"
        FROM "knowledge_chunks"
        WHERE "app_id" = ${input.apiKey.appId}
          AND "tenant_id" = ${input.apiKey.tenantId}
          AND (${input.knowledgeBaseId ?? null}::text IS NULL OR "knowledge_base_id" = ${input.knowledgeBaseId ?? null})
          AND "embedding_vector" IS NOT NULL
        ORDER BY "embedding_vector" <=> ${vector}::vector
        LIMIT ${Math.min(input.topK, 20)}
      `;
      return rows.map((row) => ({
        id: row.id,
        appId: row.appId,
        tenantId: row.tenantId,
        knowledgeBaseId: row.knowledgeBaseId,
        knowledgeFileId: row.knowledgeFileId,
        chunkIndex: row.chunkIndex,
        content: row.content,
        embedding: row.embedding as never,
        metadata: row.metadata as never,
        createdAt: row.createdAt,
        score: Number(row.score),
      }));
    } catch {
      return [];
    }
  }

  private async replaceChunks(
    knowledgeBase: KnowledgeBase,
    knowledgeFileId: string,
    file: FileAsset,
    chunks: string[],
  ) {
    await this.prisma.knowledgeChunk.deleteMany({ where: { knowledgeFileId } });
    for (const [index, content] of chunks.entries()) {
      const embedding = await this.embedForScope(
        knowledgeBase.appId,
        knowledgeBase.tenantId,
        content,
      );
      const chunk = await this.prisma.knowledgeChunk.create({
        data: {
          appId: knowledgeBase.appId,
          tenantId: knowledgeBase.tenantId,
          knowledgeBaseId: knowledgeBase.id,
          knowledgeFileId,
          chunkIndex: index,
          content,
          embedding: embedding as never,
          metadata: {
            fileId: file.id,
            fileName: file.fileName,
          },
        } as never,
      });
      await this.prisma.$executeRaw`
        UPDATE "knowledge_chunks"
        SET "embedding_vector" = ${this.toVectorLiteral(embedding)}::vector
        WHERE "id" = ${chunk.id}
      `;
    }
  }

  private async loadText(file: FileAsset) {
    this.assertSupportedParser(file);
    const metadata = file.metadata;
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const value = metadata as Record<string, unknown>;
      if (typeof value.content === 'string') {
        this.assertTextWithinLimit(value.content, 'metadata.content');
        return value.content;
      }
      if (typeof value.text === 'string') {
        this.assertTextWithinLimit(value.text, 'metadata.text');
        return value.text;
      }
    }

    if (file.objectKey.startsWith('data:text/plain,')) {
      const text = decodeURIComponent(file.objectKey.slice('data:text/plain,'.length));
      this.assertTextWithinLimit(text, 'data:text/plain payload');
      return text;
    }

    if (file.objectKey.startsWith('data:application/pdf;base64,')) {
      const buffer = Buffer.from(
        file.objectKey.slice('data:application/pdf;base64,'.length),
        'base64',
      );
      this.assertBufferWithinLimit(buffer, 'PDF payload');
      return this.parsePdf(buffer);
    }
    const docxDataUrlPrefix =
      'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,';
    if (file.objectKey.startsWith(docxDataUrlPrefix)) {
      const buffer = Buffer.from(file.objectKey.slice(docxDataUrlPrefix.length), 'base64');
      this.assertBufferWithinLimit(buffer, 'DOCX payload');
      return this.parseDocx(buffer);
    }

    if (file.sizeBytes) this.assertSizeWithinLimit(file.sizeBytes, 'file');
    const response = await this.fetchFileResponse(file);
    if (!response.ok) {
      throw new BadRequestException(`Failed to fetch file content: ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? file.mimeType ?? '';
    this.assertResponseWithinLimit(response);
    if (this.isPdf(file, contentType)) {
      const buffer = await this.readResponseBuffer(response, 'PDF response');
      return this.parsePdf(buffer);
    }
    if (this.isDocx(file, contentType)) {
      const buffer = await this.readResponseBuffer(response, 'DOCX response');
      return this.parseDocx(buffer);
    }
    if (this.isLegacyDoc(file, contentType)) {
      throw new BadRequestException('DOC parsing is not implemented yet');
    }
    if (
      contentType &&
      !contentType.includes('text/') &&
      !contentType.includes('application/json') &&
      !contentType.includes('text/markdown')
    ) {
      throw new BadRequestException(`Unsupported content type: ${contentType}`);
    }
    const text = await this.withTimeout(
      response.text(),
      this.fetchTimeoutMs(),
      'Reading text response',
    );
    this.assertTextWithinLimit(text, 'text response');
    return text;
  }

  private assertSupportedParser(file: FileAsset) {
    const lowerName = file.fileName.toLowerCase();
    const mimeType = file.mimeType?.toLowerCase() ?? '';
    if (this.isPdf(file)) return;
    if (this.isDocx(file)) return;
    const supported =
      mimeType.startsWith('text/') ||
      mimeType.includes('json') ||
      mimeType.includes('markdown') ||
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.md') ||
      lowerName.endsWith('.markdown') ||
      lowerName.endsWith('.json');
    if (supported || !file.mimeType) return;
    if (this.isLegacyDoc(file)) {
      throw new BadRequestException('DOC parsing is not implemented yet');
    }
    throw new BadRequestException(`Unsupported file parser: ${file.mimeType}`);
  }

  private fetchFileResponse(file: FileAsset) {
    return file.objectKey.startsWith('http://') || file.objectKey.startsWith('https://')
      ? this.fetchWithTimeout(file.objectKey)
      : this.fetchMinioObject(file);
  }

  private isPdf(file: FileAsset, contentType = '') {
    const lowerName = file.fileName.toLowerCase();
    const mimeType = (contentType || file.mimeType || '').toLowerCase();
    return mimeType.includes('pdf') || lowerName.endsWith('.pdf');
  }

  private isDocx(file: FileAsset, contentType = '') {
    const lowerName = file.fileName.toLowerCase();
    const mimeType = (contentType || file.mimeType || '').toLowerCase();
    return (
      mimeType.includes('wordprocessingml.document') ||
      lowerName.endsWith('.docx')
    );
  }

  private isLegacyDoc(file: FileAsset, contentType = '') {
    const lowerName = file.fileName.toLowerCase();
    const mimeType = (contentType || file.mimeType || '').toLowerCase();
    return mimeType.includes('msword') || lowerName.endsWith('.doc');
  }

  private async parsePdf(buffer: Buffer) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await this.withTimeout(
        parser.getText(),
        this.parseTimeoutMs(),
        'PDF parsing',
      );
      const text = result.text.trim();
      this.assertTextWithinLimit(text, 'PDF text');
      return text;
    } finally {
      await parser.destroy();
    }
  }

  private async parseDocx(buffer: Buffer) {
    const result = await this.withTimeout(
      mammoth.extractRawText({ buffer }),
      this.parseTimeoutMs(),
      'DOCX parsing',
    );
    const text = result.value.trim();
    this.assertTextWithinLimit(text, 'DOCX text');
    return text;
  }

  private async readResponseBuffer(response: Response, label: string) {
    const arrayBuffer = await this.withTimeout(
      response.arrayBuffer(),
      this.fetchTimeoutMs(),
      `Reading ${label}`,
    );
    const buffer = Buffer.from(arrayBuffer);
    this.assertBufferWithinLimit(buffer, label);
    return buffer;
  }

  private assertAddFileWithinLimit(body: AddKnowledgeFileDto) {
    if (body.sizeBytes !== undefined) {
      this.assertSizeWithinLimit(body.sizeBytes, 'file');
    }
    if (body.content) {
      this.assertTextWithinLimit(body.content, 'inline content');
    }
    if (body.chunks?.length) {
      const totalBytes = body.chunks.reduce(
        (sum, chunk) => sum + Buffer.byteLength(chunk, 'utf8'),
        0,
      );
      this.assertSizeWithinLimit(totalBytes, 'inline chunks');
    }
  }

  private assertResponseWithinLimit(response: Response) {
    const contentLength = response.headers.get('content-length');
    if (!contentLength) return;
    const size = Number(contentLength);
    if (Number.isFinite(size)) this.assertSizeWithinLimit(size, 'remote file');
  }

  private assertTextWithinLimit(text: string, label: string) {
    this.assertSizeWithinLimit(Buffer.byteLength(text, 'utf8'), label);
  }

  private assertBufferWithinLimit(buffer: Buffer, label: string) {
    this.assertSizeWithinLimit(buffer.byteLength, label);
  }

  private assertSizeWithinLimit(sizeBytes: number, label: string) {
    const maxBytes = this.maxParseBytes();
    if (sizeBytes > maxBytes) {
      throw new BadRequestException(
        `${label} exceeds maximum parse size of ${maxBytes} bytes`,
      );
    }
  }

  private async fetchWithTimeout(url: string, init?: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs());
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadRequestException('File fetch timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new BadRequestException(`${label} timed out`)),
        timeoutMs,
      );
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
  }

  private knowledgeJobOptions() {
    return {
      attempts: this.configNumber(
        'KNOWLEDGE_QUEUE_ATTEMPTS',
        DEFAULT_KNOWLEDGE_QUEUE_ATTEMPTS,
      ),
      backoff: {
        type: 'exponential',
        delay: this.configNumber(
          'KNOWLEDGE_QUEUE_BACKOFF_MS',
          DEFAULT_KNOWLEDGE_QUEUE_BACKOFF_MS,
        ),
      },
    };
  }

  private maxParseBytes() {
    return this.configNumber(
      'KNOWLEDGE_MAX_PARSE_BYTES',
      DEFAULT_KNOWLEDGE_MAX_PARSE_BYTES,
    );
  }

  private fetchTimeoutMs() {
    return this.configNumber(
      'KNOWLEDGE_FETCH_TIMEOUT_MS',
      DEFAULT_KNOWLEDGE_FETCH_TIMEOUT_MS,
    );
  }

  private parseTimeoutMs() {
    return this.configNumber(
      'KNOWLEDGE_PARSE_TIMEOUT_MS',
      DEFAULT_KNOWLEDGE_PARSE_TIMEOUT_MS,
    );
  }

  private configNumber(key: string, fallback: number) {
    const value = this.config.get<string | number>(key);
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async fetchMinioObject(file: FileAsset) {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT');
    const port = this.config.get<string>('MINIO_PORT');
    const accessKey = this.config.get<string>('MINIO_ACCESS_KEY');
    const secretKey = this.config.get<string>('MINIO_SECRET_KEY');
    if (!endpoint || !port || !accessKey || !secretKey) {
      throw new BadRequestException('MinIO configuration is incomplete');
    }
    const scheme = this.config.get<string>('MINIO_USE_SSL') === 'true' ? 'https' : 'http';
    const host = `${endpoint}:${port}`;
    const encodedKey = file.objectKey
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    const path = `/${encodeURIComponent(file.bucket)}/${encodedKey}`;
    const now = new Date();
    const amzDate = this.amzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const region = this.config.get<string>('MINIO_REGION') ?? 'us-east-1';
    const service = 's3';
    const payloadHash = this.sha256('');
    const canonicalHeaders = [
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
    ].join('\n');
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      'GET',
      path,
      '',
      `${canonicalHeaders}\n`,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256(canonicalRequest),
    ].join('\n');
    const signingKey = this.signatureKey(secretKey, dateStamp, region, service);
    const signature = createHmac('sha256', signingKey)
      .update(stringToSign)
      .digest('hex');
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return this.fetchWithTimeout(`${scheme}://${host}${path}`, {
      method: 'GET',
      headers: {
        authorization,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
      },
    });
  }

  private amzDate(date: Date) {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private hmac(key: Buffer | string, value: string) {
    return createHmac('sha256', key).update(value).digest();
  }

  private signatureKey(secret: string, dateStamp: string, region: string, service: string) {
    const dateKey = this.hmac(`AWS4${secret}`, dateStamp);
    const dateRegionKey = this.hmac(dateKey, region);
    const dateRegionServiceKey = this.hmac(dateRegionKey, service);
    return this.hmac(dateRegionServiceKey, 'aws4_request');
  }

  private async markTaskRunning(taskId?: string) {
    if (!taskId) return;
    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'running', startedAt: new Date() },
    });
  }

  private async markTaskSucceeded(taskId: string | undefined, result: unknown) {
    if (!taskId) return;
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'succeeded',
        result: result as never,
        finishedAt: new Date(),
      },
    });
  }

  private async markTaskFailed(taskId: string | undefined, errorMessage: string) {
    if (!taskId) return;
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'failed',
        errorMessage,
        finishedAt: new Date(),
      },
    });
  }

  private splitText(content: string) {
    const normalized = content.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];
    const chunks: string[] = [];
    for (let index = 0; index < normalized.length; index += 900) {
      chunks.push(normalized.slice(index, index + 1000));
    }
    return chunks;
  }

  private queryTerms(query: string) {
    const terms = query
      .toLowerCase()
      .split(/[\s,.;:!?，。；：！？]+/)
      .map((term) => term.trim())
      .filter(Boolean);
    return terms.length ? terms : [query];
  }

  private scoreChunk(query: string, content: string) {
    const lower = content.toLowerCase();
    return this.queryTerms(query).reduce(
      (score, term) => score + (lower.includes(term) ? 1 : 0),
      0,
    );
  }

  private async embedForScope(
    appId: string,
    tenantId: string | null,
    content: string,
  ) {
    const providerEmbedding = await this.embedWithProvider(appId, tenantId, content);
    return providerEmbedding ?? this.localEmbed(content);
  }

  private async embedWithProvider(
    appId: string,
    tenantId: string | null,
    content: string,
  ) {
    const routeKey =
      this.config.get<string>('KNOWLEDGE_EMBEDDING_ROUTE_KEY') ?? 'embedding';
    try {
      const route = await this.resolveEmbeddingRoute(appId, tenantId, routeKey);
      if (!route) return undefined;
      const model = await this.prisma.aiModel.findUnique({
        where: { id: route.primaryModelId },
      });
      if (!model || model.status !== 'active') return undefined;
      const provider = await this.prisma.aiProvider.findUnique({
        where: { id: model.providerId },
      });
      if (!provider || provider.status !== 'active') return undefined;
      const secret = this.resolveSecret(provider.secretRef);
      if (!secret) return undefined;
      const baseUrl = (provider.baseUrl ?? 'https://api.openai.com/v1').replace(
        /\/+$/,
        '',
      );
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: model.modelKey,
          input: content,
        }),
      });
      if (!response.ok) return undefined;
      const payload = await response.json().catch(() => undefined);
      const embedding = payload?.data?.[0]?.embedding;
      if (!Array.isArray(embedding)) return undefined;
      return this.normalizeVector(
        embedding.map((value: unknown) => Number(value)).filter(Number.isFinite),
      );
    } catch {
      return undefined;
    }
  }

  private async resolveEmbeddingRoute(
    appId: string,
    tenantId: string | null,
    routeKey: string,
  ) {
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

  private resolveSecret(secretRef?: string | null) {
    if (!secretRef) return undefined;
    const key = secretRef.startsWith('env:') ? secretRef.slice(4) : secretRef;
    return this.config.get<string>(key) ?? process.env[key];
  }

  private localEmbed(content: string) {
    const dimensions = 384;
    const vector = Array.from({ length: dimensions }, () => 0);
    const terms = this.queryTerms(content);
    for (const term of terms) {
      let hash = 2166136261;
      for (let index = 0; index < term.length; index++) {
        hash ^= term.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      const bucket = Math.abs(hash) % dimensions;
      vector[bucket] += 1;
    }
    return this.normalizeVector(vector);
  }

  private normalizeVector(vector: number[]) {
    const dimensions = 384;
    const projected = Array.from({ length: dimensions }, () => 0);
    for (const [index, value] of vector.entries()) {
      projected[index % dimensions] += value;
    }
    const norm = Math.sqrt(
      projected.reduce((sum, value) => sum + value * value, 0),
    );
    return norm ? projected.map((value) => value / norm) : projected;
  }

  private toVectorLiteral(vector: number[]) {
    return `[${vector.map((value) => value.toFixed(6)).join(',')}]`;
  }

  private buildExtractiveAnswer(
    sources: Array<{ content: string; score: number }>,
  ) {
    if (!sources.length) return null;
    return sources
      .slice(0, 3)
      .map((source) => source.content)
      .join('\n\n');
  }
}
