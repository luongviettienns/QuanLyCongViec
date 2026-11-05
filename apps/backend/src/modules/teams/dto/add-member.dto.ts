import { IsEmail, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TeamRole } from '@prisma/client';

export class AddMemberDto {
  @ApiProperty({ example: 'member@example.com', description: 'Email của thành viên cần thêm' })
  @IsEmail({}, { message: 'Định dạng email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @ApiPropertyOptional({ enum: TeamRole, default: TeamRole.MEMBER, description: 'Vai trò trong nhóm' })
  @IsOptional()
  @IsEnum(TeamRole, { message: 'Vai trò phải là OWNER, ADMIN hoặc MEMBER' })
  role?: TeamRole;
}
