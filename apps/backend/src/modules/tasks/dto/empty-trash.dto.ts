import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class EmptyTrashDto {
  @ApiPropertyOptional({
    description: 'Nếu truyền, chỉ dọn các công việc trong thùng rác thuộc nhóm này',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'teamId phải là số nguyên' })
  @Min(1, { message: 'teamId phải lớn hơn 0' })
  teamId?: number;
}
