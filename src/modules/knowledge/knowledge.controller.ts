import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CurrentTenantContext } from '../../common/decorators/tenant-context.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  AuthenticatedRequest,
  TenantContext,
} from '../../common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AddKnowledgeFileDto,
  CreateKnowledgeBaseDto,
  ListKnowledgeBasesDto,
  OpenRagQueryDto,
} from './dto/knowledge.dto';
import { KnowledgeService } from './knowledge.service';

@Controller()
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('admin/v1/knowledge-bases')
  @RequirePermissions('knowledge.base.read')
  bases(
    @Query() query: ListKnowledgeBasesDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.knowledge.bases(query, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/knowledge-bases')
  @RequirePermissions('knowledge.base.create')
  createBase(
    @Body() body: CreateKnowledgeBaseDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.knowledge.createBase(body, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/knowledge-bases/:id/files')
  @RequirePermissions('knowledge.file.upload')
  addFile(
    @Param('id') knowledgeBaseId: string,
    @Body() body: AddKnowledgeFileDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.knowledge.addFile(knowledgeBaseId, body, tenantContext);
  }

  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post('admin/v1/knowledge-bases/:id/rebuild-index')
  @RequirePermissions('knowledge.index.rebuild')
  rebuild(
    @Param('id') knowledgeBaseId: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.knowledge.enqueueRebuild(knowledgeBaseId, tenantContext);
  }

  @Post('open/v1/rag/query')
  ragQuery(@Body() body: OpenRagQueryDto, @Req() request: AuthenticatedRequest) {
    return this.knowledge.ragQuery(body, request, 'rag:query');
  }

  @Post('open/v1/knowledge-bases/:id/query')
  queryBase(
    @Param('id') knowledgeBaseId: string,
    @Body() body: OpenRagQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.knowledge.ragQuery(
      { ...body, knowledgeBaseId },
      request,
      'knowledge:query',
    );
  }
}
