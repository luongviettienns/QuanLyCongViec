import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { McpTokenScope } from '@prisma/client';

export const ALLOWED_MCP_TOKEN_EXPIRY_DAYS = [7, 30, 90, 365] as const;

export class CreateMcpTokenDto {
  @ApiProperty({
    description: 'Tên gợi nhớ cho API Token MCP (ví dụ: Cursor Laptop)',
    minLength: 2,
    maxLength: 60,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Tên token phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên gợi nhớ cho token' })
  @MinLength(2, { message: 'Tên token phải có ít nhất 2 ký tự' })
  @MaxLength(60, { message: 'Tên token không được vượt quá 60 ký tự' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Số ngày hết hạn (7, 30, 90, 365 hoặc bỏ trống để không hết hạn)',
    enum: ALLOWED_MCP_TOKEN_EXPIRY_DAYS,
    nullable: true,
  })
  @IsOptional()
  @IsIn([...ALLOWED_MCP_TOKEN_EXPIRY_DAYS], {
    message: 'Thời hạn token chỉ hỗ trợ 7, 30, 90 hoặc 365 ngày',
  })
  expiresInDays?: number | null;

  @ApiPropertyOptional({
    description: 'Phạm vi quyền của API Token MCP (READ hoặc READ_WRITE, mặc định READ)',
    enum: McpTokenScope,
    default: McpTokenScope.READ,
  })
  @IsOptional()
  @IsEnum(McpTokenScope, {
    message: 'Phạm vi quyền token chỉ hỗ trợ READ hoặc READ_WRITE',
  })
  scope?: McpTokenScope;
}
