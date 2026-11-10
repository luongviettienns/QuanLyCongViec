import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { trimString } from '../../../common/transformers/trim-string.transformer.js';

export class CreateSubtaskDto {
  @ApiProperty({ description: 'Tiêu đề công việc con', example: 'Thiết kế API đăng nhập' })
  @Transform(trimString)
  @IsString({ message: 'Tiêu đề công việc con phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tiêu đề công việc con không được để trống' })
  @MinLength(2, { message: 'Tiêu đề công việc con phải có ít nhất 2 ký tự' })
  @MaxLength(255, { message: 'Tiêu đề công việc con không được vượt quá 255 ký tự' })
  title!: string;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết công việc con' })
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'Mô tả công việc con phải là chuỗi ký tự' })
  @MaxLength(1000, { message: 'Mô tả công việc con không được vượt quá 1000 ký tự' })
  description?: string;

  @ApiPropertyOptional({ description: 'ID người thực hiện công việc con (Main Assignee hoặc Collaborator)' })
  @IsOptional()
  @IsInt({ message: 'Mã người thực hiện (assigneeId) phải là số nguyên' })
  @Min(1, { message: 'Mã người thực hiện (assigneeId) phải là số nguyên dương' })
  assigneeId?: number;
}
