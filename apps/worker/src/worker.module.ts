import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WorkerJobsService } from './worker-jobs.service.js';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [WorkerJobsService],
})
export class WorkerModule {}
