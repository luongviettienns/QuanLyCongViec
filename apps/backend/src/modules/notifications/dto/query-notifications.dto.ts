import { IsOptional, IsInt, Min, Max, IsIn, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from '@prisma/client';

export class QueryNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(50, { message: 'limit tối đa là 50' })
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'cursor phải là số nguyên' })
  @Min(1, { message: 'cursor không hợp lệ' })
  cursor?: number;

  @IsOptional()
  @IsIn(['all', 'unread'], { message: 'filter chỉ chấp nhận all hoặc unread' })
  filter?: 'all' | 'unread' = 'all';

  @IsOptional()
  @IsEnum(NotificationType, { message: 'Loại thông báo không hợp lệ' })
  type?: NotificationType;
}
