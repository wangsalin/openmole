import { Module } from '@nestjs/common';
import { DeveloperController } from './developer.controller';
import { DeveloperService } from './developer.service';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Module({
  controllers: [DeveloperController],
  providers: [DeveloperService, WebhookDeliveryService],
  exports: [DeveloperService, WebhookDeliveryService],
})
export class DeveloperModule {}
