import {
  IsArray,
  ArrayUnique,
  IsInt,
  IsOptional,
  IsIn,
  ArrayNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReorderTasksDto {
  @ApiProperty({
    description: 'Danh sách ID công việc theo thứ tự mới từ trên xuống dưới (vị trí 0, 1, 2...)',
    example: [3, 1, 2],
  })
  @IsArray({ message: 'taskIds phải là một danh sách mảng' })
  @ArrayNotEmpty({ message: 'Danh sách ID công việc không được để trống' })
  @ArrayUnique({ message: 'Các ID trong danh sách không được trùng lặp' })
  @IsInt({ each: true, message: 'Mỗi ID công việc phải là số nguyên' })
  taskIds: number[];

  @ApiPropertyOptional({
    description: 'Trạng thái cột của các công việc (tuỳ chọn)',
    enum: ['TODO', 'IN_PROGRESS', 'DONE'],
  })
  @IsOptional()
  @IsIn(['TODO', 'IN_PROGRESS', 'DONE'], {
    message: 'Trạng thái phải là TODO, IN_PROGRESS hoặc DONE',
  })
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
} 

