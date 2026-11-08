import {
  IsArray,
  ArrayUnique,
  IsInt,
  IsOptional,
  IsEnum,
  ArrayNotEmpty,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';

export class ReorderTasksDto {
  @ApiProperty({
    description: 'Danh sách ID công việc theo thứ tự mới từ trên xuống dưới (vị trí 0, 1, 2...)',
    example: [3, 1, 2],
  })
  @IsArray({ message: 'taskIds phải là một danh sách mảng' })
  @ArrayNotEmpty({ message: 'Danh sách ID công việc không được để trống' })
  @ArrayUnique({ message: 'Các ID trong danh sách không được trùng lặp' })
  @IsInt({ each: true, message: 'Mỗi ID công việc phải là số nguyên' })
  @Min(1, { each: true, message: 'Mỗi ID công việc phải là số nguyên dương' })
  taskIds: number[];

  @ApiPropertyOptional({
    description: 'Trạng thái cột của các công việc (tuỳ chọn)',
    enum: TaskStatus,
  })
  @IsOptional()
  @IsEnum(TaskStatus, {
    message: 'Trạng thái phải là TODO, IN_PROGRESS hoặc DONE',
  })
  status?: TaskStatus;

  @ApiPropertyOptional({
    description: 'Mã nhóm làm việc (nếu sắp xếp trên bảng nhóm)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Mã nhóm phải là số nguyên' })
  @Min(1, { message: 'Mã nhóm phải là số nguyên dương' })
  teamId?: number;
}
