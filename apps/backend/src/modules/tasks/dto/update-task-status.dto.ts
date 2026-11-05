import { IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';

export class UpdateTaskStatusDto {
  @ApiProperty({
    description: 'Trạng thái mới của công việc',
    enum: TaskStatus,
    example: TaskStatus.IN_PROGRESS,
  })
  @IsNotEmpty({ message: 'Trạng thái công việc không được để trống' })
  @IsEnum(TaskStatus, { message: 'Trạng thái công việc phải là TODO, IN_PROGRESS hoặc DONE' })
  status: TaskStatus;
}
