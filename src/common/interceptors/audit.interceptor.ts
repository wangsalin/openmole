import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { AuthenticatedRequest } from '../types/authenticated-request';

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const url = request.originalUrl ?? request.url ?? '';

    if (!this.shouldAudit(request.method, url)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((response) => {
        void this.writeAuditLog(request, response);
      }),
    );
  }

  private shouldAudit(method: string, url: string) {
    if (!MUTATION_METHODS.has(method)) return false;
    if (url.includes('/audit-logs')) return false;
    return (
      url.startsWith('/admin/v1') ||
      url.startsWith('/tenant/v1') ||
      url.startsWith('/payment/webhook')
    );
  }

  private async writeAuditLog(
    request: AuthenticatedRequest,
    response: unknown,
  ) {
    try {
      const url = request.originalUrl ?? request.url ?? '';
      const parts = url.split('?')[0]?.split('/').filter(Boolean) ?? [];
      const resource = parts.slice(2, 4).join('.') || parts.join('.');
      await this.prisma.auditLog.create({
        data: {
          appId: request.tenantContext?.appId,
          tenantId: request.tenantContext?.tenantId,
          userId: request.user?.sub,
          action: request.method,
          resource,
          resourceId: request.params?.id,
          ip: request.ip,
          userAgent: request.get?.('user-agent'),
          after: this.toJson({
            requestId: request.requestId,
            response,
          }),
        },
      });
    } catch {
      // Auditing must never break the business response.
    }
  }

  private toJson(value: unknown) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value)) as never;
  }
}
