import { IsNotEmpty, IsString, IsOptional, IsInt, MinLength, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
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
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  })
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
    message: 'Mã màu phải là mã HEX hợp lệ (ví dụ: #1890ff hoặc #fff)',
  })
  color?: string;

  @ApiPropertyOptional({
    description: 'Mã nhóm làm việc (nếu là danh mục của nhóm, để trống nếu là cá nhân)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Mã nhóm phải là số nguyên' })
  teamId?: number;
}
