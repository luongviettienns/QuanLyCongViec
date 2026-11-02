import { IsNotEmpty, IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({ description: 'Tiêu đề công việc', example: 'Học NestJS' })
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  @IsString({ message: 'Tiêu đề phải là chuỗi ký tự' })
  title: string;

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết',
    example: 'Tìm hiểu về Module, Controller, Service',
  })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Trạng thái công việc',
    enum: ['TODO', 'IN_PROGRESS', 'DONE'],
    default: 'TODO',
  })
  @IsOptional()
  @IsIn(['TODO', 'IN_PROGRESS', 'DONE'], {
    message: 'Trạng thái phải là TODO, IN_PROGRESS hoặc DONE',
  })
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
}
