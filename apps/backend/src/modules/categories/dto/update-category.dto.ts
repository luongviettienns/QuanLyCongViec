import { IsString, MinLength, MaxLength, Matches, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCategoryDto {
  @ApiPropertyOptional({
    description: 'Tên danh mục mới (từ 2 đến 50 ký tự)',
    example: 'Học tập nâng cao',
  })
  // Non-nullable: only `undefined` skips validation, `null` must be rejected (400) instead of crashing the service.
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
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'Mã màu phải là mã HEX hợp lệ (ví dụ: #1890ff hoặc #fff)',
  })
  color?: string;
}
