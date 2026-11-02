import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import type { Task } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Task[]> {
    return this.prisma.task.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number): Promise<Task> {
    const task = await this.prisma.task.findUnique({
      where: { id },
    });
    if (!task) {
      throw new NotFoundException(`Không tìm thấy công việc với mã #${id}`);
    }
    return task;
  }

  async create(data: CreateTaskDto): Promise<Task> {
    const existingTask = await this.prisma.task.findUnique({
      where: { title: data.title },
    });
    if (existingTask) {
      throw new ConflictException(`Tiêu đề công việc '${data.title}' đã tồn tại`);
    }

    return this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        status: data.status,
      },
    });
  }

  async update(id: number, data: UpdateTaskDto): Promise<Task> {
    await this.findOne(id);

    if (data.title !== undefined) {
      const existingTask = await this.prisma.task.findUnique({
        where: { title: data.title },
      });
      if (existingTask && existingTask.id !== id) {
        throw new ConflictException(`Tiêu đề công việc '${data.title}' đã tồn tại`);
      }
    } 

    const updateData: UpdateTaskDto = {};
    if (data.title !== undefined) {
      updateData.title = data.title;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    return this.prisma.task.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: number): Promise<{ success: boolean; message: string; deletedTask: Task }> {
    await this.findOne(id);

    const deletedTask = await this.prisma.task.delete({
      where: { id },
    });

    return {
      success: true,
      message: `Đã xoá thành công công việc #${id}`,
      deletedTask,
    };
  }
}
