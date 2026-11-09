import { IsString, IsOptional, MinLength, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { trimString } from '../../../common/transformers/trim-string.transformer.js';

export class UpdateTeamDto {
  @ApiPropertyOptional({ example: 'Đội ngũ Web Frontend', description: 'Tên nhóm' })
  // Non-nullable: only `undefined` skips validation, so `{"name": null}` is rejected instead of silently ignored.
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trimString)
  @IsString({ message: 'Tên nhóm phải là chuỗi' })
  @MinLength(2, { message: 'Tên nhóm phải có ít nhất 2 ký tự' })
  @MaxLength(50, { message: 'Tên nhóm tối đa 50 ký tự' })
  name?: string;

  @ApiPropertyOptional({ example: 'Mô tả cập nhật của nhóm', description: 'Mô tả nhóm' })
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự' })
  description?: string;
}
