import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTeamDto {
  @ApiProperty({ example: 'Đội ngũ Frontend', description: 'Tên nhóm' })
  @IsString({ message: 'Tên nhóm phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên nhóm không được để trống' })
  @MinLength(2, { message: 'Tên nhóm phải có ít nhất 2 ký tự' })
  @MaxLength(50, { message: 'Tên nhóm tối đa 50 ký tự' })
  name: string;

  @ApiPropertyOptional({ example: 'Nhóm phụ trách giao diện người dùng', description: 'Mô tả nhóm' })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự' })
  description?: string;
}
