import { IsNotEmpty, IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Tên danh mục (từ 2 đến 50 ký tự)',
    example: 'Công việc',
  })
  @IsNotEmpty({ message: 'Tên danh mục không được để trống' })
  @IsString({ message: 'Tên danh mục phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên danh mục phải có ít nhất 2 ký tự' })
  @MaxLength(50, { message: 'Tên danh mục không được vượt quá 50 ký tự' })
  name: string;

  @ApiPropertyOptional({
    description: 'Mã màu hex của danh mục',
    example: '#1890ff',
    default: '#1890ff',
  })
  @IsOptional()
  @IsString({ message: 'Mã màu phải là chuỗi ký tự' })
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'Mã màu phải là mã HEX hợp lệ (ví dụ: #1890ff hoặc #fff)',
  })
  color?: string;
}
