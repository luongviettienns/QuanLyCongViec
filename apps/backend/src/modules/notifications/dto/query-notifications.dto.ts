import { IsOptional, IsInt, Min, Max, IsIn, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from '@prisma/client';

export const NOTIFICATION_FILTERS = ['all', 'unread', 'important'] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

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
  @IsIn([...NOTIFICATION_FILTERS], {
    message: 'filter chỉ chấp nhận all, unread hoặc important',
  })
  filter?: NotificationFilter = 'all';

  @IsOptional()
  @IsEnum(NotificationType, { message: 'Loại thông báo không hợp lệ' })
  type?: NotificationType;
}
