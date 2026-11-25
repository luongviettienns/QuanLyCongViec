import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateTaskCommentDto {
  @ApiProperty({ description: 'Nội dung bình luận mới', minLength: 1, maxLength: 2000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Nội dung bình luận phải là chuỗi' })
  @IsNotEmpty({ message: 'Nội dung bình luận không được để trống' })
  @MinLength(1, { message: 'Nội dung bình luận phải có ít nhất 1 ký tự' })
  @MaxLength(2000, { message: 'Nội dung bình luận không được vượt quá 2000 ký tự' })
  content!: string;

  @ApiPropertyOptional({ description: 'Danh sách userId được @mention sau chỉnh sửa', type: [Number] })
  @IsOptional()
  @IsArray({ message: 'mentionedUserIds phải là mảng số nguyên' })
  @ArrayMaxSize(20, { message: 'Chỉ được nhắc đến tối đa 20 thành viên trong một bình luận' })
  @Type(() => Number)
  @IsInt({ each: true, message: 'Mỗi userId được nhắc đến phải là số nguyên' })
  @Min(1, { each: true, message: 'Mỗi userId được nhắc đến phải lớn hơn 0' })
  mentionedUserIds?: number[];
}
