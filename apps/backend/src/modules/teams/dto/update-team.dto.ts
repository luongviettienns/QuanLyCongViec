import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTeamDto {
  @ApiPropertyOptional({ example: 'Đội ngũ Web Frontend', description: 'Tên nhóm' })
  @IsOptional()
  @IsString({ message: 'Tên nhóm phải là chuỗi' })
  @MinLength(2, { message: 'Tên nhóm phải có ít nhất 2 ký tự' })
  @MaxLength(50, { message: 'Tên nhóm tối đa 50 ký tự' })
  name?: string;

  @ApiPropertyOptional({ example: 'Mô tả cập nhật của nhóm', description: 'Mô tả nhóm' })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự' })
  description?: string;
}
