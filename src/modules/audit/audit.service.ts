import { Injectable } from '@nestjs/common';
import { buildPagination, omitUndefined } from '../../common/prisma-list';
import { tenantScopedQuery } from '../../common/tenant-scope';
import { TenantContext } from '../../common/types/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: AuditQueryDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scope = tenantScopedQuery(query, tenantContext);
    return this.prisma.auditLog.findMany({
      where: omitUndefined({
        appId: scope.appId,
        tenantId: scope.tenantId,
        userId: query.userId,
        action: query.action,
        resource: query.resource,
        createdAt:
          query.from || query.to
            ? omitUndefined({ gte: query.from, lte: query.to })
            : undefined,
      }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  write(data: Record<string, unknown>) {
    return this.prisma.auditLog.create({ data: data as never });
  }

  writeSecurityEvent(data: {
    action: string;
    resource: string;
    userId?: string;
    appId?: string;
    tenantId?: string | null;
    ip?: string;
    userAgent?: string;
    after?: Record<string, unknown>;
  }) {
    return this.prisma.auditLog.create({
      data: {
        action: data.action,
        resource: data.resource,
        userId: data.userId,
        appId: data.appId,
        tenantId: data.tenantId,
        ip: data.ip,
        userAgent: data.userAgent,
        after: data.after as never,
      },
    });
  }
}
