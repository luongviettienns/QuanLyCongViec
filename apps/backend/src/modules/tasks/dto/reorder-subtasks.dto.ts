import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, ArrayMinSize, Min } from 'class-validator';

export class ReorderSubtasksDto {
  @ApiProperty({ description: 'Danh sách ID công việc con theo thứ tự mới', example: [3, 1, 2] })
  @IsArray({ message: 'Danh sách subtaskIds phải là mảng các số nguyên' })
  @ArrayMinSize(1, { message: 'Mảng subtaskIds phải có ít nhất 1 phần tử' })
  @IsInt({ each: true, message: 'Mỗi ID công việc con phải là số nguyên' })
  @Min(1, { each: true, message: 'Mỗi ID công việc con phải là số nguyên dương' })
  subtaskIds!: number[];
}
