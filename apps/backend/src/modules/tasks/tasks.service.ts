import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { ReorderTasksDto } from './dto/reorder-tasks.dto.js';
import { FilterTasksDto } from './dto/filter-tasks.dto.js';
import type { Task, Prisma } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) { }


  async findAll(query?: FilterTasksDto): Promise<Task[]> {
    const where: Prisma.TaskWhereInput = {};

    if (query?.search) {
      const keyword = query.search.trim();
      if (keyword.length > 0) {
        where.OR = [
          {
            title: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
        ];
      }
    }

    if (query?.status) {
      where.status = query.status;
    }

    return this.prisma.task.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { position: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }


  async findOne(id: number): Promise<Task> {

    if (isNaN(id) || id <= 0) {
      throw new BadRequestException('Mã công việc (ID) phải là số nguyên dương hợp lệ');
    }


    const task = await this.prisma.task.findUnique({
      where: { id: id },
    });

    if (!task) {
      throw new NotFoundException(`Không tìm thấy công việc với mã #${id}`);
    }

    return task;
  }


  async create(data: CreateTaskDto): Promise<Task> {

    const cleanTitle = data.title.trim();


    if (cleanTitle.length < 3) {
      throw new BadRequestException('Tiêu đề công việc phải có ít nhất 3 ký tự (không tính khoảng trắng thừa)');
    }


    const existingTask = await this.prisma.task.findFirst({
      where: {
        title: {
          equals: cleanTitle,
          mode: 'insensitive',
        },
      },
    });

    if (existingTask) {
      throw new ConflictException(`Tiêu đề '${cleanTitle}' đã tồn tại, vui lòng đặt tên khác`);
    }


    let cleanDescription: string | null = null;
    if (data.description) {
      const trimmed = data.description.trim();
      if (trimmed.length > 0) {
        cleanDescription = trimmed;
      }
    }


    const initialStatus = data.status ? data.status : 'TODO';


    const lastTaskInColumn = await this.prisma.task.findFirst({
      where: { status: initialStatus },
      orderBy: { position: 'desc' },
    });

    const nextPosition = lastTaskInColumn ? lastTaskInColumn.position + 1 : 0;


    const newTask = await this.prisma.task.create({
      data: {
        title: cleanTitle,
        description: cleanDescription,
        status: initialStatus,
        position: nextPosition,
      },
    });

    return newTask;
  }


  async update(id: number, data: UpdateTaskDto): Promise<Task> {

    const currentTask = await this.findOne(id);


    const hasTitle = data.title !== undefined;
    const hasDescription = data.description !== undefined;
    const hasStatus = data.status !== undefined;

    if (!hasTitle && !hasDescription && !hasStatus) {
      throw new BadRequestException('Vui lòng cung cấp ít nhất một thông tin cần cập nhật (tiêu đề, mô tả hoặc trạng thái)');
    }


    const updateData: {
      title?: string;
      description?: string | null;
      status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
      position?: number;
    } = {};


    if (hasTitle && data.title !== undefined) {
      const cleanTitle = data.title.trim();

      if (cleanTitle.length < 3) {
        throw new BadRequestException('Tiêu đề công việc mới phải có ít nhất 3 ký tự');
      }


      const duplicateTask = await this.prisma.task.findFirst({
        where: {
          title: {
            equals: cleanTitle,
            mode: 'insensitive',
          },
          NOT: {
            id: id,
          },
        },
      });

      if (duplicateTask) {
        throw new ConflictException(`Tiêu đề '${cleanTitle}' đã được sử dụng bởi một công việc khác`);
      }

      updateData.title = cleanTitle;
    }

    if (hasDescription && data.description !== undefined) {
      const trimmedDesc = data.description.trim();
      updateData.description = trimmedDesc.length > 0 ? trimmedDesc : null;
    }

    const isStatusChanged = hasStatus && data.status !== undefined && data.status !== currentTask.status;

    if (isStatusChanged && data.status !== undefined) {
      const newStatus = data.status;


      const lastTaskInNewCol = await this.prisma.task.findFirst({
        where: { status: newStatus },
        orderBy: { position: 'desc' },
      });
      const newPositionInNewCol = lastTaskInNewCol ? lastTaskInNewCol.position + 1 : 0;

      updateData.status = newStatus;
      updateData.position = newPositionInNewCol;


      const [updatedTask] = await this.prisma.$transaction([
        this.prisma.task.update({
          where: { id: id },
          data: updateData,
        }),
        this.prisma.task.updateMany({
          where: {
            status: currentTask.status,
            position: {
              gt: currentTask.position,
            },
          },
          data: {
            position: {
              decrement: 1,
            },
          },
        }),
      ]);

      return updatedTask;
    }


    if (hasStatus && data.status !== undefined) {
      updateData.status = data.status;
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: id },
      data: updateData,
    });

    return updatedTask;
  }


  async remove(id: number): Promise<{ success: boolean; message: string; deletedTask: Task }> {

    const taskToDelete = await this.findOne(id);


    const [deletedTask] = await this.prisma.$transaction([
      this.prisma.task.delete({
        where: { id: id },
      }),
      this.prisma.task.updateMany({
        where: {
          status: taskToDelete.status,
          position: {
            gt: taskToDelete.position,
          },
        },
        data: {
          position: {
            decrement: 1,
          },
        },
      }),
    ]);

    return {
      success: true,
      message: `Đã xoá thành công công việc #${id} - "${taskToDelete.title}"`,
      deletedTask: deletedTask,
    };
  }
  async reorder(dto: ReorderTasksDto): Promise<{ success: boolean; message: string }> {
   
    if (!dto.taskIds || dto.taskIds.length === 0) {
      throw new BadRequestException('Danh sách ID công việc không được để trống');
    }


    const tasksToUpdate = await this.prisma.task.findMany({
      where: {
        id: { in: dto.taskIds },
      },
    });

    if (tasksToUpdate.length !== dto.taskIds.length) {
      throw new NotFoundException('Một hoặc nhiều công việc trong danh sách không tồn tại');
    }

    
    const cleanupOldColumnOps = [];
    if (dto.status) {
      for (const currentTask of tasksToUpdate) {
        if (currentTask.status !== dto.status) {
          cleanupOldColumnOps.push(
            this.prisma.task.updateMany({
              where: {
                status: currentTask.status,
                position: {
                  gt: currentTask.position,
                },
              },
              data: {
                position: {
                  decrement: 1,
                },
              },
            }),
          );
        }
      }
    }

    const reorderOps = dto.taskIds.map((taskId, newPosition) => {
      return this.prisma.task.update({
        where: { id: taskId },
        data: {
          position: newPosition,
          ...(dto.status ? { status: dto.status } : {}),
        },
      });
    });

   
    await this.prisma.$transaction([...cleanupOldColumnOps, ...reorderOps]);

    return {
      success: true,
      message: 'Cập nhật thứ tự công việc vào database thành công',
    };
  }
}
