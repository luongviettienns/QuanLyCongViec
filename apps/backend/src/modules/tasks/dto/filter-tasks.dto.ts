import { IsOptional, IsString, MaxLength, IsEnum, IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus, TaskPriority } from '@prisma/client';

export const TASK_SCOPES = [
  'all',
  'my_work',
  'assigned_to_me',
  'collaborating',
  'pending_invites',
  'subtasks_assigned_to_me',
  'created_by_me',
] as const;

export type TaskScope = (typeof TASK_SCOPES)[number];

export const DEADLINE_FILTERS = [
  'overdue',
  'due_soon',
  'today',
  'no_due_date',
] as const;

export type DeadlineFilter = (typeof DEADLINE_FILTERS)[number];

export const TASK_SORT_OPTIONS = [
  'default',
  'due_date_asc',
  'due_date_desc',
  'priority_desc',
] as const;

export type TaskSortBy = (typeof TASK_SORT_OPTIONS)[number];

export class FilterTasksDto {
  @ApiPropertyOptional({
    description: 'Từ khoá tìm kiếm theo tiêu đề công việc',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Từ khoá tìm kiếm phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Từ khoá tìm kiếm không được vượt quá 100 ký tự' })
  search?: string;

  @ApiPropertyOptional({
    description: 'Trạng thái công việc cần lọc',
    enum: TaskStatus,
  })
  @IsOptional()
  @IsEnum(TaskStatus, {
    message: 'Trạng thái lọc phải là TODO, IN_PROGRESS hoặc DONE',
  })
  status?: TaskStatus;

  @ApiPropertyOptional({
    description: 'Mức độ ưu tiên cần lọc',
    enum: TaskPriority,
  })
  @IsOptional()
  @IsEnum(TaskPriority, {
    message: 'Mức độ ưu tiên lọc phải là LOW, MEDIUM hoặc HIGH',
  })
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description: 'Mã danh mục cần lọc (ID)',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Mã danh mục lọc phải là số nguyên' })
  @Min(1, { message: 'Mã danh mục lọc phải là số nguyên dương' })
  categoryId?: number;

  @ApiPropertyOptional({
    description: 'Mã nhóm làm việc cần lọc (ID)',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Mã nhóm lọc phải là số nguyên' })
  @Min(1, { message: 'Mã nhóm lọc phải là số nguyên dương' })
  teamId?: number;

  @ApiPropertyOptional({
    description: 'Mã người được phân công cần lọc (ID)',
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Mã người được phân công lọc phải là số nguyên' })
  @Min(1, { message: 'Mã người được phân công lọc phải là số nguyên dương' })
  assigneeId?: number;

  @ApiPropertyOptional({
    description: 'Phạm vi công việc: all (mặc định), my_work, assigned_to_me, collaborating, pending_invites, subtasks_assigned_to_me, created_by_me',
    enum: TASK_SCOPES,
  })
  @IsOptional()
  @IsIn([...TASK_SCOPES], {
    message: 'Phạm vi phải là all, my_work, assigned_to_me, collaborating, pending_invites, subtasks_assigned_to_me hoặc created_by_me',
  })
  scope?: TaskScope;

  @ApiPropertyOptional({
    description: 'Lọc theo hạn chót: overdue, due_soon, today, no_due_date',
    enum: DEADLINE_FILTERS,
  })
  @IsOptional()
  @IsIn([...DEADLINE_FILTERS], {
    message: 'Bộ lọc deadline phải là overdue, due_soon, today hoặc no_due_date',
  })
  deadlineFilter?: DeadlineFilter;

  @ApiPropertyOptional({
    description: 'Sắp xếp công việc: default, due_date_asc, due_date_desc, priority_desc',
    enum: TASK_SORT_OPTIONS,
  })
  @IsOptional()
  @IsIn([...TASK_SORT_OPTIONS], {
    message: 'Cách sắp xếp phải là default, due_date_asc, due_date_desc hoặc priority_desc',
  })
  sortBy?: TaskSortBy;
}
