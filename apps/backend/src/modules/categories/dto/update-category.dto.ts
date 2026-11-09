import { IsString, MinLength, MaxLength, Matches, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCategoryDto {
  @ApiPropertyOptional({
    description: 'Tên danh mục mới (từ 2 đến 50 ký tự)',
    example: 'Học tập nâng cao',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: 'Tên danh mục phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên danh mục phải có ít nhất 2 ký tự' })
  @MaxLength(50, { message: 'Tên danh mục không được vượt quá 50 ký tự' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Mã màu hex mới của danh mục',
    example: '#52c41a',
  })
  @ValidateIf((_, value) => value !== undefined)
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
}
