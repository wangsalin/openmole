import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA = 'openmole:rate-limit';

export interface RateLimitOptions {
  name: string;
  limit: number;
  windowSec: number;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_METADATA, options);
