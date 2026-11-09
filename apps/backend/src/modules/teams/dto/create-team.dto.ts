import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { trimString } from '../../../common/transformers/trim-string.transformer.js';

export class CreateTeamDto {
  @ApiProperty({ example: 'Đội ngũ Frontend', description: 'Tên nhóm' })
  @Transform(trimString)
  @IsString({ message: 'Tên nhóm phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên nhóm không được để trống' })
  @MinLength(2, { message: 'Tên nhóm phải có ít nhất 2 ký tự' })
  @MaxLength(50, { message: 'Tên nhóm tối đa 50 ký tự' })
  name: string;

  @ApiPropertyOptional({ example: 'Nhóm phụ trách giao diện người dùng', description: 'Mô tả nhóm' })
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự' })
  description?: string;
}
