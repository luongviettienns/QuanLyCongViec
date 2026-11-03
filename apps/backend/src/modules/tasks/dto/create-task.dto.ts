import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsIn,
  MinLength,
  MaxLength,
  IsISO8601,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
    description: 'Mô tả chi tiết công việc (tối đa 500 ký tự)',
    example: 'Tìm hiểu về Module, Controller, Service và Prisma',
  })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Mô tả không được vượt quá 500 ký tự' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Trạng thái công việc',
    enum: ['TODO', 'IN_PROGRESS', 'DONE'],
    default: 'TODO',
  })
  @IsOptional()
  @IsIn(['TODO', 'IN_PROGRESS', 'DONE'], {
    message: 'Trạng thái phải là một trong các giá trị: TODO, IN_PROGRESS, DONE',
  })
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';

  @ApiPropertyOptional({
    description: 'Ngày bắt đầu công việc (định dạng ISO8601)',
    example: '2026-11-03T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'Ngày bắt đầu phải là định dạng ngày hợp lệ (ISO8601)' })
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Hạn chót công việc (deadline / dueDate, định dạng ISO8601)',
    example: '2026-11-10T23:59:59.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'Hạn chót phải là định dạng ngày hợp lệ (ISO8601)' })
  dueDate?: string;
}
