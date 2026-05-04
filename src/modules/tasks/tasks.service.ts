import { Injectable } from '@nestjs/common';
import { buildPagination, omitUndefined } from '../../common/prisma-list';
import { assertTenantScopedAccess, tenantScopedQuery } from '../../common/tenant-scope';
import { TenantContext } from '../../common/types/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: Record<string, string>, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scope = tenantScopedQuery(query, tenantContext);
    return this.prisma.task.findMany({
      where: omitUndefined({
        appId: scope.appId,
        tenantId: scope.tenantId,
        status: query.status,
        taskType: query.taskType,
      }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  create(body: Record<string, unknown>, tenantContext?: TenantContext) {
    if (tenantContext) {
      assertTenantScopedAccess(
        {
          appId: typeof body.appId === 'string' ? body.appId : undefined,
          tenantId: typeof body.tenantId === 'string' ? body.tenantId : undefined,
        },
        tenantContext,
        'Task is outside tenant context',
      );
    }
    return this.prisma.task.create({ data: body as never });
  }
}
