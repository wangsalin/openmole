import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthenticatedRequest } from '../types/authenticated-request';

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: AuthenticatedRequest, response: Response, next: () => void) {
    const incoming =
      firstHeader(request.headers['x-request-id']) ??
      firstHeader(request.headers['x-correlation-id']);
    const requestId = incoming?.trim() || randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
