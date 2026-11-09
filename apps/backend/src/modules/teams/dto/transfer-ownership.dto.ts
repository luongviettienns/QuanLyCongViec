import { IsNotEmpty, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferOwnershipDto {
  @ApiProperty({
    description: 'Mã người dùng của thành viên được chuyển giao quyền OWNER',
    example: 2,
  })
  @IsNotEmpty({ message: 'Mã chủ nhóm mới không được để trống' })
  @IsInt({ message: 'Mã chủ nhóm mới phải là số nguyên' })
  @Min(1, { message: 'Mã chủ nhóm mới phải là số nguyên dương' })
  newOwnerId: number;
}
