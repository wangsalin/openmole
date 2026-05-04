import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeProcessor } from './knowledge.processor';
import { KnowledgeService } from './knowledge.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'knowledge' })],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeProcessor],
})
export class KnowledgeModule {}
