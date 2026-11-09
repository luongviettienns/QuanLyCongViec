import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  Matches,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus, TaskPriority } from '@prisma/client';

export class CreateTaskDto {
  @ApiProperty({
    description: 'Tiêu đề công việc (từ 3 đến 100 ký tự)',
    example: 'Học NestJS cơ bản',
  })
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  @IsString({ message: 'Tiêu đề phải là chuỗi ký tự' })
  @MinLength(3, { message: 'Tiêu đề phải có ít nhất 3 ký tự' })
  @MaxLength(100, { message: 'Tiêu đề không được vượt quá 100 ký tự' })
  title: string;

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết công việc (tối đa 1000 ký tự)',
    example: 'Tìm hiểu về Module, Controller, Service và Prisma',
  })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  @MaxLength(1000, { message: 'Mô tả không được vượt quá 1000 ký tự' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Trạng thái công việc',
    enum: TaskStatus,
    default: TaskStatus.TODO,
  })
  @IsOptional()
  @IsEnum(TaskStatus, {
    message: 'Trạng thái phải là một trong các giá trị: TODO, IN_PROGRESS, DONE',
  })
  status?: TaskStatus;

  @ApiPropertyOptional({
    description: 'Ngày bắt đầu công việc (định dạng YYYY-MM-DD)',
    example: '2026-11-03',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày bắt đầu phải có định dạng YYYY-MM-DD' })
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Hạn chót công việc (deadline / dueDate, định dạng YYYY-MM-DD)',
    example: '2026-11-10',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Hạn chót phải có định dạng YYYY-MM-DD' })
  dueDate?: string;

  @ApiPropertyOptional({
    description: 'Mức độ ưu tiên của công việc',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  @IsOptional()
  @IsEnum(TaskPriority, {
    message: 'Mức độ ưu tiên phải là một trong các giá trị: LOW, MEDIUM, HIGH',
  })
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description: 'Mã danh mục của công việc (ID)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Mã danh mục phải là số nguyên' })
  @Min(1, { message: 'Mã danh mục phải là số nguyên dương' })
  categoryId?: number;

  @ApiPropertyOptional({
    description: 'Mã nhóm làm việc (ID, để trống nếu là công việc cá nhân)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Mã nhóm phải là số nguyên' })
  @Min(1, { message: 'Mã nhóm phải là số nguyên dương' })
  teamId?: number;

  @ApiPropertyOptional({
    description: 'Mã người được phân công (ID thành viên)',
    example: 2,
  })
  @IsOptional()
  @IsInt({ message: 'Mã người được phân công phải là số nguyên' })
  @Min(1, { message: 'Mã người được phân công phải là số nguyên dương' })
  assigneeId?: number;
}
