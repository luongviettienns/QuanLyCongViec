import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { TaskQueryService } from './services/task-query.service.js';
import { TaskCrudService } from './services/task-crud.service.js';
import { TaskWorkflowService } from './services/task-workflow.service.js';
import { TaskReorderService } from './services/task-reorder.service.js';
import { TaskStatsService } from './services/task-stats.service.js';
import { TaskPolicyService } from './policies/task-policy.service.js';
import { PrismaService } from '../../database/prisma.service.js';

@Module({
  controllers: [TasksController],
  providers: [
    TasksService,
    TaskQueryService,
    TaskCrudService,
    TaskWorkflowService,
    TaskReorderService,
    TaskStatsService,
    TaskPolicyService,
    PrismaService,
  ],
  exports: [
    TasksService,
    TaskQueryService,
    TaskCrudService,
    TaskWorkflowService,
    TaskReorderService,
    TaskStatsService,
    TaskPolicyService,
  ],
})
export class TaskModule {}
