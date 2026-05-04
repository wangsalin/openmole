import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthenticatedRequest } from '../types/authenticated-request';

interface ErrorBody {
  code?: string;
  message?: string | string[];
  error?: string;
  statusCode?: number;
  details?: unknown;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<AuthenticatedRequest>();
    const response = context.getResponse<Response>();
    const status = this.status(exception);
    const body = this.body(exception);

    response.status(status).json({
      requestId: request.requestId,
      code: this.code(status, body),
      message: this.message(status, body, exception),
      details: this.details(body),
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
    });
  }

  private status(exception: unknown) {
    return exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private body(exception: unknown): ErrorBody | undefined {
    if (!(exception instanceof HttpException)) return undefined;
    const response = exception.getResponse();
    if (typeof response === 'string') return { message: response };
    if (response && typeof response === 'object') return response as ErrorBody;
    return undefined;
  }

  private code(status: number, body?: ErrorBody) {
    if (body?.code) return body.code;
    if (status === HttpStatus.BAD_REQUEST && Array.isArray(body?.message)) {
      return 'VALIDATION_FAILED';
    }
    const reason = body?.error ?? HttpStatus[status] ?? 'ERROR';
    return String(reason)
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
  }

  private message(status: number, body?: ErrorBody, exception?: unknown) {
    if (Array.isArray(body?.message)) return 'Validation failed';
    if (typeof body?.message === 'string') return body.message;
    if (exception instanceof Error && status >= 500) return 'Internal server error';
    return body?.error ?? 'Request failed';
  }

  private details(body?: ErrorBody) {
    if (body?.details !== undefined) return body.details;
    if (Array.isArray(body?.message)) return body.message;
    return undefined;
  }
}
