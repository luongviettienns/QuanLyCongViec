import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { BulkTaskIdsDto } from './bulk-task-ids.dto.js';

export class BulkUpdateTaskStatusDto extends BulkTaskIdsDto {
  @ApiProperty({
    description: 'Trạng thái mới áp dụng cho các công việc đã chọn',
    enum: TaskStatus,
    example: TaskStatus.DONE,
  })
  @IsEnum(TaskStatus, { message: 'Trạng thái không hợp lệ' })
  status: TaskStatus;
}
