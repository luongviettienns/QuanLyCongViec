import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { TaskPolicyService } from './task-policy.service.js';
import { PrismaService } from '../../database/prisma.service.js';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TaskPolicyService, PrismaService],
  exports: [TasksService, TaskPolicyService],
})
export class TaskModule {}
