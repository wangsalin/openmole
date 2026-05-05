import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { catchError, Observable, tap, throwError } from 'rxjs';
import { AuthenticatedRequest } from '../types/authenticated-request';

interface AccessLogEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  event: 'http.request';
  requestId?: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip?: string;
  userAgent?: string;
  userId?: string;
  appId?: string;
  tenantId?: string | null;
  errorCode?: string;
}

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpAccess');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        if (!this.shouldLog(request)) return;
        this.writeLog(request, response.statusCode, Date.now() - startedAt);
      }),
      catchError((error: unknown) => {
        if (this.shouldLog(request)) {
          const statusCode =
            error instanceof HttpException ? error.getStatus() : 500;
          this.writeLog(
            request,
            statusCode,
            Date.now() - startedAt,
            this.errorCode(error, statusCode),
          );
        }
        return throwError(() => error);
      }),
    );
  }

  private shouldLog(request: AuthenticatedRequest) {
    const path = request.originalUrl ?? request.url ?? '';
    return path !== '/health';
  }

  private writeLog(
    request: AuthenticatedRequest,
    statusCode: number,
    durationMs: number,
    errorCode?: string,
  ) {
    const event: AccessLogEvent = {
      timestamp: new Date().toISOString(),
      level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
      event: 'http.request',
      requestId: request.requestId,
      method: request.method,
      path: request.originalUrl ?? request.url ?? '',
      statusCode,
      durationMs,
      ip: request.ip,
      userAgent: request.get?.('user-agent'),
      userId: request.user?.sub,
      appId: request.tenantContext?.appId,
      tenantId: request.tenantContext?.tenantId,
      errorCode,
    };

    const line = JSON.stringify(event);
    if (event.level === 'error') {
      this.logger.error(line);
    } else if (event.level === 'warn') {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
  }

  private errorCode(error: unknown, statusCode: number) {
    if (!(error instanceof HttpException)) return 'INTERNAL_SERVER_ERROR';
    const body = error.getResponse();
    if (body && typeof body === 'object' && 'code' in body) {
      return String((body as { code?: unknown }).code);
    }
    return statusCode === 429 ? 'RATE_LIMITED' : undefined;
  }
}
