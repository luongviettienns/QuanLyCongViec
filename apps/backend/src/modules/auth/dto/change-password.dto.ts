import { IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Mật khẩu hiện tại',
    example: 'OldPass123!',
  })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu hiện tại' })
  @IsString({ message: 'Mật khẩu hiện tại phải là chuỗi ký tự' })
  currentPassword: string;

  @ApiProperty({
    description: 'Mật khẩu mới (từ 8 đến 64 ký tự, không chứa khoảng trắng)',
    example: 'NewStrongPass123!',
  })
  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  @IsString({ message: 'Mật khẩu mới phải là chuỗi ký tự' })
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
  @MaxLength(64, { message: 'Mật khẩu mới không được vượt quá 64 ký tự' })
  @Matches(/^\S+$/, { message: 'Mật khẩu mới không được chứa khoảng trắng' })
  newPassword: string;
}
