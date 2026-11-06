import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { TaskQueryService } from './services/task-query.service.js';
import { TaskCrudService } from './services/task-crud.service.js';
import { TaskWorkflowService } from './services/task-workflow.service.js';
import { TaskReorderService } from './services/task-reorder.service.js';
import { TaskStatsService } from './services/task-stats.service.js';
import { TaskPolicyService } from './policies/task-policy.service.js';
import { TaskWorkflowPolicy } from './policies/task-workflow-policy.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    TaskQueryService,
    TaskCrudService,
    TaskWorkflowService,
    TaskReorderService,
    TaskStatsService,
    TaskPolicyService,
    TaskWorkflowPolicy,
  ],
  exports: [
    TasksService,
    TaskPolicyService,
    TaskWorkflowPolicy,
  ],
})
export class TaskModule {}
