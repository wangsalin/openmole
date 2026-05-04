import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

type CheckStatus = 'ok' | 'error';

export interface DependencyCheck {
  status: CheckStatus;
  latencyMs: number;
  message?: string;
}

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  uptimeSec: number;
  latencyMs: number;
  timestamp: string;
  checks: {
    postgres: DependencyCheck;
    redis: DependencyCheck;
    minio: DependencyCheck;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const startedAt = Date.now();
    const [postgres, redis, minio] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkMinio(),
    ]);
    const checks = { postgres, redis, minio };
    const status = Object.values(checks).every((item) => item.status === 'ok')
      ? 'ok'
      : 'degraded';

    return {
      status,
      uptimeSec: Math.round(process.uptime()),
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkPostgres(): Promise<DependencyCheck> {
    return this.measure(async () => {
      await this.prisma.$queryRaw`SELECT 1`;
    });
  }

  private async checkRedis(): Promise<DependencyCheck> {
    const redis = new Redis({
      host: this.config.get<string>('REDIS_HOST') ?? 'localhost',
      port: this.configNumber('REDIS_PORT', 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
    try {
      return await this.measure(async () => {
        await redis.connect();
        await redis.ping();
      });
    } finally {
      redis.disconnect();
    }
  }

  private async checkMinio(): Promise<DependencyCheck> {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT') ?? 'localhost';
    const port = this.configNumber('MINIO_PORT', 9000);
    const useSsl = this.config.get<string>('MINIO_USE_SSL') === 'true';
    const url = `${useSsl ? 'https' : 'http'}://${endpoint}:${port}/minio/health/live`;
    return this.measure(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`MinIO health returned ${response.status}`);
        }
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  private async measure(check: () => Promise<void>): Promise<DependencyCheck> {
    const startedAt = Date.now();
    try {
      await check();
      return { status: 'ok', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: 'error',
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'Health check failed',
      };
    }
  }

  private configNumber(key: string, fallback: number) {
    const value = this.config.get<string | number>(key);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
