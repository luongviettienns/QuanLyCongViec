import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'Địa chỉ email người dùng',
    example: 'user@example.com',
  })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @ApiProperty({
    description: 'Họ và tên người dùng (từ 2 đến 50 ký tự)',
    example: 'Nguyễn Văn A',
  })
  @IsNotEmpty({ message: 'Tên không được để trống' })
  @IsString({ message: 'Tên phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên phải có ít nhất 2 ký tự' })
  @MaxLength(50, { message: 'Tên không được vượt quá 50 ký tự' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({
    description: 'Mật khẩu đăng nhập (từ 8 đến 64 ký tự, không chứa khoảng trắng)',
    example: 'StrongPass123!',
  })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @MaxLength(64, { message: 'Mật khẩu không được vượt quá 64 ký tự' })
  @Matches(/^\S+$/, { message: 'Mật khẩu không được chứa khoảng trắng' })
  password: string;
}
