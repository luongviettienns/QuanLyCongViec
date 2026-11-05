import { IsOptional, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MoveTaskTeamDto {
  @ApiPropertyOptional({
    description: 'Mã nhóm mới (ID) hoặc null nếu chuyển về cá nhân',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Mã nhóm phải là số nguyên' })
  teamId?: number | null;

  @ApiPropertyOptional({
    description: 'Mã người được phân công trong nhóm mới',
    example: 2,
  })
  @IsOptional()
  @IsInt({ message: 'Mã người được phân công phải là số nguyên' })
  assigneeId?: number | null;
}
