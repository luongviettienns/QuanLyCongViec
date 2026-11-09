import { IsString, IsOptional, MinLength, MaxLength, IsEnum, IsInt, Matches, Min, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority } from '@prisma/client';

export class UpdateTaskContentDto {
  @ApiPropertyOptional({
    description: 'Tiêu đề công việc mới',
    example: 'Cập nhật tài liệu kỹ thuật',
    minLength: 3,
    maxLength: 100,
  })
  // Non-nullable: only `undefined` skips validation, `null` must be rejected (400) instead of crashing the service.
  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: 'Tiêu đề công việc phải là chuỗi ký tự' })
  @MinLength(3, { message: 'Tiêu đề công việc phải có ít nhất 3 ký tự' })
  @MaxLength(100, { message: 'Tiêu đề công việc không được vượt quá 100 ký tự' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết công việc',
    example: 'Bổ sung sơ đồ phân quyền và kiểm thử',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString({ message: 'Mô tả công việc phải là chuỗi ký tự' })
  @MaxLength(1000, { message: 'Mô tả công việc không được vượt quá 1000 ký tự' })
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Độ ưu tiên của công việc',
    enum: TaskPriority,
    example: TaskPriority.HIGH,
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(TaskPriority, { message: 'Độ ưu tiên không hợp lệ (LOW, MEDIUM, HIGH)' })
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description: 'Ngày bắt đầu công việc (YYYY-MM-DD)',
    example: '2026-11-05',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày bắt đầu phải đúng định dạng YYYY-MM-DD' })
  startDate?: string | null;

  @ApiPropertyOptional({
    description: 'Hạn chót công việc (YYYY-MM-DD)',
    example: '2026-11-10',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Hạn chót phải đúng định dạng YYYY-MM-DD' })
  dueDate?: string | null;

  @ApiPropertyOptional({
    description: 'Mã danh mục của công việc',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Mã danh mục phải là số nguyên' })
  @Min(1, { message: 'Mã danh mục phải là số nguyên dương' })
  categoryId?: number | null;
}
