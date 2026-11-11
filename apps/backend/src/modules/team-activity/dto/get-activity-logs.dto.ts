import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TeamActivityAction } from '@prisma/client';

export class GetTeamActivityLogsDto {
  @ApiPropertyOptional({ minimum: 1, description: 'Số trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Trang phải là số nguyên' })
  @Min(1, { message: 'Trang phải lớn hơn hoặc bằng 1' })
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, description: 'Số bản ghi trên mỗi trang (mặc định 4 khi có phân trang, 100 khi không truyền)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng tối thiểu là 1' })
  @Max(100, { message: 'Số lượng tối đa là 100' })
  limit?: number;

  @ApiPropertyOptional({ enum: TeamActivityAction, description: 'Lọc theo loại hành động' })
  @IsOptional()
  @IsEnum(TeamActivityAction, { message: 'Loại hành động không hợp lệ' })
  action?: TeamActivityAction;

  @ApiPropertyOptional({ description: 'Lọc theo ID người thực hiện' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'actorId phải là số nguyên' })
  actorId?: number;
}
