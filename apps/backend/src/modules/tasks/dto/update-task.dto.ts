import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  Matches,
  IsInt,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus, TaskPriority } from '@prisma/client';

export class UpdateTaskDto {
  @ApiPropertyOptional({
    description: 'Tiêu đề công việc mới (từ 3 đến 100 ký tự)',
    example: 'Học NestJS nâng cao',
  })
  // Non-nullable: only `undefined` skips validation, `null` must be rejected (400) instead of crashing the service.
  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: 'Tiêu đề phải là chuỗi ký tự' })
  @MinLength(3, { message: 'Tiêu đề phải có ít nhất 3 ký tự' })
  @MaxLength(100, { message: 'Tiêu đề không được vượt quá 100 ký tự' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết công việc mới (tối đa 1000 ký tự)',
    example: 'Nghiên cứu về Guards và Interceptors',
  })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  @MaxLength(1000, { message: 'Mô tả không được vượt quá 1000 ký tự' })
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Trạng thái công việc mới',
    enum: TaskStatus,
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(TaskStatus, {
    message: 'Trạng thái phải là một trong các giá trị: TODO, IN_PROGRESS, DONE',
  })
  status?: TaskStatus;

  @ApiPropertyOptional({
    description: 'Ngày bắt đầu công việc mới (định dạng YYYY-MM-DD)',
    example: '2026-11-03',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày bắt đầu phải có định dạng YYYY-MM-DD' })
  startDate?: string | null;

  @ApiPropertyOptional({
    description: 'Hạn chót công việc mới (định dạng YYYY-MM-DD)',
    example: '2026-11-10',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Hạn chót phải có định dạng YYYY-MM-DD' })
  dueDate?: string | null;

  @ApiPropertyOptional({
    description: 'Mức độ ưu tiên mới của công việc',
    enum: TaskPriority,
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(TaskPriority, {
    message: 'Mức độ ưu tiên phải là một trong các giá trị: LOW, MEDIUM, HIGH',
  })
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description: 'Mã danh mục mới của công việc (ID hoặc null để hủy gán)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Mã danh mục phải là số nguyên' })
  @Min(1, { message: 'Mã danh mục phải là số nguyên dương' })
  categoryId?: number | null;

  @ApiPropertyOptional({
    description: 'Mã nhóm làm việc (ID hoặc null để chuyển thành task cá nhân)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Mã nhóm phải là số nguyên' })
  @Min(1, { message: 'Mã nhóm phải là số nguyên dương' })
  teamId?: number | null;

  @ApiPropertyOptional({
    description: 'Mã người được phân công (ID hoặc null để hủy gán)',
    example: 2,
  })
  @IsOptional()
  @IsInt({ message: 'Mã người được phân công phải là số nguyên' })
  @Min(1, { message: 'Mã người được phân công phải là số nguyên dương' })
  assigneeId?: number | null;
}
