import { IsOptional, IsString, MaxLength, IsIn, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
    enum: ['TODO', 'IN_PROGRESS', 'DONE'],
  })
  @IsOptional()
  @IsIn(['TODO', 'IN_PROGRESS', 'DONE'], {
    message: 'Trạng thái lọc phải là TODO, IN_PROGRESS hoặc DONE',
  })
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';

  @ApiPropertyOptional({
    description: 'Mức độ ưu tiên cần lọc',
    enum: ['LOW', 'MEDIUM', 'HIGH'],
  })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'], {
    message: 'Mức độ ưu tiên lọc phải là LOW, MEDIUM hoặc HIGH',
  })
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiPropertyOptional({
    description: 'Mã danh mục cần lọc (ID)',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Mã danh mục lọc phải là số nguyên' })
  categoryId?: number;
}
