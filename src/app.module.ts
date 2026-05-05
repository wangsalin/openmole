import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { SecurityModule } from './common/security.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { AiCenterModule } from './modules/ai-center/ai-center.module';
import { AppCenterModule } from './modules/app-center/app-center.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DeveloperModule } from './modules/developer/developer.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { PermissionModule } from './modules/permission/permission.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { SystemModule } from './modules/system/system.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { UsageModule } from './modules/usage/usage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: config.get<number>('REDIS_PORT') ?? 6379,
        },
      }),
    }),
    PrismaModule,
    SecurityModule,
    AuthModule,
    IdentityModule,
    AppCenterModule,
    TenancyModule,
    PermissionModule,
    BillingModule,
    UsageModule,
    AiCenterModule,
    KnowledgeModule,
    DeveloperModule,
    HealthModule,
    TasksModule,
    AuditModule,
    SystemModule,
    DashboardModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityHeadersMiddleware, RequestIdMiddleware).forRoutes('*');
  }
}
