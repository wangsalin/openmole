import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_request: AuthenticatedRequest, response: Response, next: NextFunction) {
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('cross-origin-opener-policy', 'same-origin');
    response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    next();
  }
}
