import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../modules/audit/audit.module';
import { PermissionGuard } from './guards/permission.guard';

@Global()
@Module({
  imports: [AuditModule],
  providers: [PermissionGuard],
  exports: [PermissionGuard],
})
export class SecurityModule {}
