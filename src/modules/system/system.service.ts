import { Injectable } from '@nestjs/common';
import { buildPagination, omitUndefined } from '../../common/prisma-list';
import {
  assertTenantScopedAccess,
  tenantScopedQuery,
} from '../../common/tenant-scope';
import { TenantContext } from '../../common/types/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDictItemDto,
  ListDictItemsDto,
  ListSettingsDto,
  UpsertSettingDto,
} from './dto/system.dto';

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  settings(query: ListSettingsDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    const scope = tenantScopedQuery(query, tenantContext);
    return this.prisma.setting.findMany({
      where: omitUndefined({
        appId: scope.appId,
        tenantId: scope.tenantId,
        scope: query.scope,
        key: query.key,
      }),
      skip,
      take,
      orderBy: { updatedAt: 'desc' },
    });
  }

  upsertSetting(body: UpsertSettingDto, tenantContext?: TenantContext) {
    const appId = body.appId ? String(body.appId) : null;
    const tenantId = body.tenantId ? String(body.tenantId) : null;
    if (tenantContext) {
      assertTenantScopedAccess(
        { appId, tenantId },
        tenantContext,
        'Setting is outside tenant context',
      );
    }
    const key = String(body.key);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.setting.findFirst({
        where: { appId, tenantId, key },
      });
      if (existing) {
        return tx.setting.update({
          where: { id: existing.id },
          data: {
            value: body.value as never,
            scope: String(body.scope ?? 'system'),
          },
        });
      }
      return tx.setting.create({
        data: {
          appId,
          tenantId,
          key,
          value: body.value as never,
          scope: String(body.scope ?? 'system'),
        },
      });
    });
  }

  dictItems(query: ListDictItemsDto) {
    const { skip, take } = buildPagination(query);
    return this.prisma.dictItem.findMany({
      where: omitUndefined({ dictKey: query.dictKey, status: query.status }),
      skip,
      take,
      orderBy: [{ dictKey: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  createDictItem(body: CreateDictItemDto) {
    return this.prisma.dictItem.create({ data: body as never });
  }
}
