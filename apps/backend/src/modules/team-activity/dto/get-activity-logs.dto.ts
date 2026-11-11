import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TeamActivityAction } from '@prisma/client';

export class GetTeamActivityLogsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 100000, description: 'Số trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Trang phải là số nguyên' })
  @Min(1, { message: 'Trang phải lớn hơn hoặc bằng 1' })
  @Max(100000, { message: 'Trang vượt quá giới hạn' })
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, description: 'Số bản ghi trên mỗi trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng tối thiểu là 1' })
  @Max(100, { message: 'Số lượng tối đa là 100' })
  limit?: number = 20;

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

export class TeamActivityActorDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  name: string;
}

export class TeamActivityLogUserDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  name: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;
}

export class TeamActivityLogItemDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1, nullable: true })
  teamId: number | null;

  @ApiProperty({ example: 1 })
  teamIdSnapshot: number;

  @ApiProperty({ example: 'Development Team' })
  teamNameSnapshot: string;

  @ApiProperty({ example: 1, nullable: true })
  actorId: number | null;

  @ApiProperty({ enum: TeamActivityAction })
  action: TeamActivityAction;

  @ApiProperty({ example: 2, nullable: true })
  targetUserId: number | null;

  @ApiProperty({ example: { taskId: 1, taskTitle: 'Task Title' }, nullable: true })
  metadata: any;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: TeamActivityLogUserDto, nullable: true })
  actor?: TeamActivityLogUserDto | null;

  @ApiProperty({ type: TeamActivityLogUserDto, nullable: true })
  targetUser?: TeamActivityLogUserDto | null;
}

export class PaginatedTeamActivityLogsResponseDto {
  @ApiProperty({ type: [TeamActivityLogItemDto] })
  data: TeamActivityLogItemDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;

  @ApiProperty({ type: [TeamActivityActorDto] })
  actors: TeamActivityActorDto[];
}
