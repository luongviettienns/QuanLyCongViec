import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReturnTaskDto {
  @ApiProperty({
    description: 'Lý do trả lại công việc cho người tạo',
    example: 'Cần làm rõ thêm yêu cầu kỹ thuật',
    maxLength: 500,
  })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do trả lại công việc' })
  @IsString({ message: 'Lý do trả lại công việc phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Lý do trả lại không được vượt quá 500 ký tự' })
  reason: string;
}
