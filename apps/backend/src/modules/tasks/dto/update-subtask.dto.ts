import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsInt,
  Min,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { trimString } from '../../../common/transformers/trim-string.transformer.js';
import { TaskStatus } from '@prisma/client';

export class UpdateSubtaskDto {
  @ApiPropertyOptional({ description: 'Tiêu đề công việc con', example: 'Thiết kế API đăng nhập cập nhật' })
  @ValidateIf((_obj, val) => val !== undefined)
  @Transform(trimString)
  @IsString({ message: 'Tiêu đề công việc con phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tiêu đề công việc con phải có ít nhất 2 ký tự' })
  @MaxLength(255, { message: 'Tiêu đề công việc con không được vượt quá 255 ký tự' })
  title?: string;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết công việc con' })
  @ValidateIf((_obj, val) => val !== undefined && val !== null)
  @Transform(trimString)
  @IsString({ message: 'Mô tả công việc con phải là chuỗi ký tự' })
  @MaxLength(1000, { message: 'Mô tả công việc con không được vượt quá 1000 ký tự' })
  description?: string | null;

  @ApiPropertyOptional({ description: 'ID người thực hiện công việc con (hoặc null để hủy phân công)' })
  @ValidateIf((_obj, val) => val !== undefined && val !== null)
  @IsInt({ message: 'Mã người thực hiện (assigneeId) phải là số nguyên' })
  @Min(1, { message: 'Mã người thực hiện (assigneeId) phải là số nguyên dương' })
  assigneeId?: number | null;

  @ApiPropertyOptional({ description: 'Trạng thái công việc con', enum: TaskStatus })
  @ValidateIf((_obj, val) => val !== undefined)
  @IsEnum(TaskStatus, { message: 'Trạng thái công việc con phải là TODO, IN_PROGRESS hoặc DONE' })
  status?: TaskStatus;
}
