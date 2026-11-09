import { IsNotEmpty, IsEnum, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiPropertyOptional({
    description: 'Vị trí mới trong cột đích (bắt đầu từ 0)',
    example: 0,
  })
  @IsOptional()
  @IsInt({ message: 'Vị trí phải là số nguyên' })
  @Min(0, { message: 'Vị trí không được nhỏ hơn 0' })
  position?: number;
}
