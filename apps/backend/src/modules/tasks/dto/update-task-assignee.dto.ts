import { IsOptional, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTaskAssigneeDto {
  @ApiPropertyOptional({
    description: 'Mã người được phân công (null nếu hủy phân công)',
    example: 2,
    nullable: true,
  })
  @IsOptional()
  @IsInt({ message: 'Mã người được phân công phải là số nguyên' })
  assigneeId?: number | null;
}
