import { IsOptional, IsInt, Min, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MoveTaskTeamDto {
  @ApiPropertyOptional({
    description: 'Mã nhóm mới (ID) hoặc null nếu chuyển về cá nhân',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Mã nhóm phải là số nguyên' })
  @Min(1, { message: 'Mã nhóm phải là số nguyên dương' })
  teamId?: number | null;

  @ApiPropertyOptional({
    description: 'Mã người được phân công trong nhóm mới',
    example: 2,
  })
  @IsOptional()
  @IsInt({ message: 'Mã người được phân công phải là số nguyên' })
  @Min(1, { message: 'Mã người được phân công phải là số nguyên dương' })
  assigneeId?: number | null;

  @ApiPropertyOptional({
    description: 'Tiêu đề công việc mới khi di chuyển giữa các nhóm (nếu có cập nhật)',
    example: 'Tiêu đề sau khi chuyển nhóm',
  })
  @IsOptional()
  @IsString({ message: 'Tiêu đề phải là chuỗi ký tự' })
  title?: string;
}
