import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentTenantContext } from '../../common/decorators/tenant-context.decorator';
import { TenantContext } from '../../common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditService } from './audit.service';

@UseGuards(JwtAuthGuard)
@Controller('admin/v1/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query() query: AuditQueryDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.audit.list(query, tenantContext);
  }
}
