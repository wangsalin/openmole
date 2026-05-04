import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentTenantContext } from '../../common/decorators/tenant-context.decorator';
import { TenantContext } from '../../common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TasksService } from './tasks.service';

@UseGuards(JwtAuthGuard)
@Controller('admin/v1/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @Query() query: Record<string, string>,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tasks.list(query, tenantContext);
  }

  @Post()
  create(
    @Body() body: Record<string, unknown>,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.tasks.create(body, tenantContext);
  }
}
