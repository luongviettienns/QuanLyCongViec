import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { TaskStatus } from '@prisma/client';

export class UpdateSubtaskStatusDto {
  @ApiProperty({ description: 'Trạng thái mới của công việc con', enum: TaskStatus, example: 'IN_PROGRESS' })
  @IsNotEmpty({ message: 'Trạng thái không được để trống' })
  @IsEnum(TaskStatus, { message: 'Trạng thái công việc con phải là TODO, IN_PROGRESS hoặc DONE' })
  status!: TaskStatus;
}
