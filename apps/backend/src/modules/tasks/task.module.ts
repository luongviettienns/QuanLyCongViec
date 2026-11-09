import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { TaskQueryService } from './services/task-query.service.js';
import { TaskCrudService } from './services/task-crud.service.js';
import { TaskWorkflowService } from './services/task-workflow.service.js';
import { TaskStatusService } from './services/task-status.service.js';
import { TaskAssignmentService } from './services/task-assignment.service.js';
import { TaskTransferService } from './services/task-transfer.service.js';
import { TaskReorderService } from './services/task-reorder.service.js';
import { TaskStatsService } from './services/task-stats.service.js';
import { TaskPolicyService } from './policies/task-policy.service.js';
import { TaskWorkflowPolicy } from './policies/task-workflow-policy.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    TaskQueryService,
    TaskCrudService,
    TaskWorkflowService,
    TaskStatusService,
    TaskAssignmentService,
    TaskTransferService,
    TaskReorderService,
    TaskStatsService,
    TaskPolicyService,
    TaskWorkflowPolicy,
  ],
  exports: [
    TasksService,
    TaskPolicyService,
    TaskWorkflowPolicy,
    TaskWorkflowService,
    TaskStatusService,
    TaskAssignmentService,
    TaskTransferService,
    TaskQueryService,
    TaskCrudService,
    TaskReorderService,
    TaskStatsService,
  ],
})
export class TaskModule {}
