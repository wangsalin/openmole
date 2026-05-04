import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { buildPagination, omitUndefined } from '../../common/prisma-list';
import { TenantContext } from '../../common/types/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppDto, ListAppsDto, UpdateAppDto } from './dto/app.dto';

@Injectable()
export class AppsService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: ListAppsDto, tenantContext?: TenantContext) {
    const { skip, take } = buildPagination(query);
    return this.prisma.app.findMany({
      where: omitUndefined({
        id: tenantContext?.isPlatform ? undefined : tenantContext?.appId,
        status: query.status,
        appType: query.appType,
      }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  create(body: CreateAppDto) {
    return this.prisma.app.create({ data: body as never });
  }

  async get(id: string, tenantContext?: TenantContext) {
    this.assertAppAccess(id, tenantContext);
    const app = await this.prisma.app.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('App not found');
    return app;
  }

  update(
    id: string,
    body: UpdateAppDto | { status: 'disabled' },
    tenantContext?: TenantContext,
  ) {
    this.assertAppAccess(id, tenantContext);
    return this.prisma.app.update({ where: { id }, data: body as never });
  }

  private assertAppAccess(id: string, tenantContext?: TenantContext) {
    if (!tenantContext?.isPlatform && tenantContext?.appId !== id) {
      throw new ForbiddenException('App is outside current context');
    }
  }
}
