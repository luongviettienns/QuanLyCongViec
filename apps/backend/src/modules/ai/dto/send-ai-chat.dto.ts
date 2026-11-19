import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { trimString } from '../../../common/index.js';

export class SendAiChatDto {
  @ApiPropertyOptional({
    description: 'Mã cuộc trò chuyện hiện có (bỏ trống để tạo cuộc trò chuyện mới)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Mã cuộc trò chuyện phải là số nguyên' })
  @Min(1, { message: 'Mã cuộc trò chuyện phải là số nguyên dương' })
  conversationId?: number;

  @ApiProperty({
    description: 'Nội dung tin nhắn gửi tới trợ lý AI (1..2000 ký tự)',
    minLength: 1,
    maxLength: 2000,
  })
  @Transform(trimString)
  @IsString({ message: 'Nội dung tin nhắn phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Nội dung tin nhắn không được để trống' })
  @MinLength(1, { message: 'Nội dung tin nhắn không được để trống' })
  @MaxLength(2000, { message: 'Nội dung tin nhắn không được vượt quá 2000 ký tự' })
  message!: string;
}
