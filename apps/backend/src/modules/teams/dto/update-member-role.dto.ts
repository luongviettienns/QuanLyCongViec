import { IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TeamRole } from '@prisma/client';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: TeamRole, example: TeamRole.ADMIN, description: 'Vai trò mới của thành viên' })
  @IsNotEmpty({ message: 'Vai trò không được để trống' })
  @IsEnum(TeamRole, { message: 'Vai trò phải là ADMIN hoặc MEMBER' })
  role: TeamRole;
}
