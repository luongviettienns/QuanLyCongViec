import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class InviteCollaboratorDto {
  @ApiProperty({ description: 'ID của người dùng được mời làm người phối hợp', example: 2 })
  @IsInt({ message: 'Mã người dùng (userId) phải là số nguyên' })
  @Min(1, { message: 'Mã người dùng (userId) phải là số nguyên dương' })
  userId!: number;
}
