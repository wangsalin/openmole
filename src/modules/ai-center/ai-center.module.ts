import { Module } from '@nestjs/common';
import { DeveloperModule } from '../developer/developer.module';
import { UsageModule } from '../usage/usage.module';
import { AiCenterController } from './ai-center.controller';
import { AiProviderAdapter } from './ai-provider.adapter';
import { AiCenterService } from './ai-center.service';

@Module({
  imports: [UsageModule, DeveloperModule],
  controllers: [AiCenterController],
  providers: [AiCenterService, AiProviderAdapter],
})
export class AiCenterModule {}
