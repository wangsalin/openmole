import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { KnowledgeService } from './knowledge.service';

@Processor('knowledge')
export class KnowledgeProcessor extends WorkerHost {
  constructor(private readonly knowledge: KnowledgeService) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'parse-file') {
      return this.knowledge.parseQueuedFile(job.data);
    }
    if (job.name === 'rebuild-index') {
      return this.knowledge.rebuildQueuedIndex(job.data);
    }
    return { ignored: true, jobName: job.name };
  }
}
