import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { Response } from 'express';
import {
  RATE_LIMIT_METADATA,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';

interface RateBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateBucket>();
  private lastSweepAt = Date.now();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const now = Date.now();
    this.sweepExpired(now);

    const key = this.key(options, request);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + options.windowSec * 1000,
      });
      return true;
    }

    bucket.count += 1;
    if (bucket.count <= options.limit) return true;

    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
    context.switchToHttp().getResponse<Response>().setHeader('retry-after', retryAfterSec);
    throw new HttpException(
      {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        details: {
          limit: options.limit,
          windowSec: options.windowSec,
          retryAfterSec,
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private key(options: RateLimitOptions, request: AuthenticatedRequest) {
    const authorization = this.firstHeader(request.headers.authorization);
    const forwardedFor = this.firstHeader(request.headers['x-forwarded-for']);
    const forwardedIp = forwardedFor?.split(',')[0]?.trim();
    const actor = authorization
      ? this.hash(authorization)
      : forwardedIp || request.ip;
    return `${options.name}:${actor ?? 'unknown'}`;
  }

  private firstHeader(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex').slice(0, 24);
  }

  private sweepExpired(now: number) {
    if (now - this.lastSweepAt < 60_000) return;
    this.lastSweepAt = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
