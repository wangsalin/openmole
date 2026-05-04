import { Injectable } from '@nestjs/common';
import { omitUndefined } from '../../common/prisma-list';
import { tenantScopedQuery } from '../../common/tenant-scope';
import { TenantContext } from '../../common/types/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: Record<string, string>, tenantContext?: TenantContext) {
    const scopedQuery = tenantScopedQuery(query, tenantContext);
    const scope = omitUndefined(scopedQuery);
    const tenantScope = omitUndefined({
      appId: scopedQuery.appId,
      id: scopedQuery.tenantId,
    });
    const [tenants, orders, aiCalls, tasks] = await Promise.all([
      this.prisma.tenant.count({ where: tenantScope }),
      this.prisma.order.count({ where: scope }),
      this.prisma.aiCallLog.count({ where: scope }),
      this.prisma.task.count({ where: scope }),
    ]);
    return { tenants, orders, aiCalls, tasks };
  }
}
