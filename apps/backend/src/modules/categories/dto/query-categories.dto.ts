import { IsOptional, IsInt, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryCategoriesDto {
  @ApiPropertyOptional({
    description: 'Mã nhóm làm việc (nếu lọc danh mục của nhóm)',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Mã nhóm (teamId) phải là số nguyên' })
  @Min(1, { message: 'Mã nhóm (teamId) phải là số nguyên dương hợp lệ' })
  teamId?: number;

  @ApiPropertyOptional({
    description: 'Phạm vi danh mục: all (cá nhân + các nhóm tham gia) | personal | team',
    example: 'all',
    enum: ['all', 'personal', 'team'],
  })
  @IsOptional()
  @IsIn(['all', 'personal', 'team'], {
    message: 'Phạm vi (scope) chỉ chấp nhận all, personal hoặc team',
  })
  scope?: 'all' | 'personal' | 'team';
}
