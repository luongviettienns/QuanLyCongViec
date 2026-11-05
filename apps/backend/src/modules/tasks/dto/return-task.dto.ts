import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReturnTaskDto {
  @ApiPropertyOptional({
    description: 'Lý do trả lại công việc cho người tạo',
    example: 'Cần làm rõ thêm yêu cầu kỹ thuật',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Lý do trả lại công việc phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Lý do trả lại không được vượt quá 500 ký tự' })
  reason?: string;
}
