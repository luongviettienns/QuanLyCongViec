import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { PrismaService } from '../../database/prisma.service.js';

@Module({
  controllers: [TasksController],
  providers: [TasksService, PrismaService],
})
export class TaskModule {}
