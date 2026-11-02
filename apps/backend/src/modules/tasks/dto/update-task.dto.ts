import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTaskDto {
  @ApiPropertyOptional({
    description: 'Tiêu đề công việc',
    example: 'Cập nhật tiêu đề',
  })
  @IsOptional()
  @IsString({ message: 'Tiêu đề phải là chuỗi ký tự' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết',
    example: 'Cập nhật mô tả chi tiết',
  })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Trạng thái công việc',
    enum: ['TODO', 'IN_PROGRESS', 'DONE'],
  })
  @IsOptional()
  @IsIn(['TODO', 'IN_PROGRESS', 'DONE'], {
    message: 'Trạng thái phải là TODO, IN_PROGRESS hoặc DONE',
  })
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
}
