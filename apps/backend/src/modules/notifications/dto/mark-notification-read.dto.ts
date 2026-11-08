import { IsArray, ArrayMinSize, ArrayMaxSize, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class MarkBulkReadDto {
  @IsArray({ message: 'ids phải là một danh sách' })
  @ArrayMinSize(1, { message: 'Danh sách ID không được để trống' })
  @ArrayMaxSize(50, { message: 'Không thể đánh dấu nhiều hơn 50 thông báo mỗi lần' })
  @IsInt({ each: true, message: 'Mỗi ID thông báo phải là số nguyên' })
  @Type(() => Number)
  ids: number[];
}
