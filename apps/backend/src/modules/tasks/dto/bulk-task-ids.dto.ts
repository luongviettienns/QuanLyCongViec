import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  Min,
} from 'class-validator';

export class BulkTaskIdsDto {
  @ApiProperty({
    description: 'Danh sách ID công việc cần thao tác (tối đa 100)',
    type: [Number],
    example: [1, 2, 3],
  })
  @IsArray({ message: 'taskIds phải là một mảng số nguyên' })
  @ArrayNotEmpty({ message: 'Danh sách công việc không được rỗng' })
  @ArrayMaxSize(100, { message: 'Chỉ hỗ trợ tối đa 100 công việc mỗi lần thao tác' })
  @ArrayUnique({ message: 'Danh sách công việc không được chứa ID trùng lặp' })
  @IsInt({ each: true, message: 'Mỗi ID công việc phải là số nguyên' })
  @Min(1, { each: true, message: 'ID công việc phải lớn hơn 0' })
  taskIds: number[];
}
