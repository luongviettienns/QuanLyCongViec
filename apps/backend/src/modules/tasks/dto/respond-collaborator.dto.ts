import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class RespondCollaboratorDto {
  @ApiProperty({
    description: 'Hành động phản hồi lời mời: ACCEPT (chấp nhận) hoặc DECLINE (từ chối)',
    enum: ['ACCEPT', 'DECLINE'],
    example: 'ACCEPT',
  })
  @IsIn(['ACCEPT', 'DECLINE'], {
    message: 'Hành động phải là ACCEPT hoặc DECLINE',
  })
  action!: 'ACCEPT' | 'DECLINE';
}
