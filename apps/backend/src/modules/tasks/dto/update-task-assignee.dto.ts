import { IsOptional, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTaskAssigneeDto {
  @ApiPropertyOptional({
    description:
      'Mã người được phân công. Bắt buộc phải gửi trường này: số nguyên dương để giao việc, null để hủy phân công (body rỗng bị từ chối)',
    example: 2,
    nullable: true,
  })
  @IsOptional()
  @IsInt({ message: 'Mã người được phân công phải là số nguyên' })
  @Min(1, { message: 'Mã người được phân công phải là số nguyên dương' })
  assigneeId?: number | null;
}
