import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(@Res({ passthrough: true }) response: Response) {
    const result = await this.health.check();
    if (result.status !== 'ok') {
      response.status(503);
    }
    return result;
  }
}
