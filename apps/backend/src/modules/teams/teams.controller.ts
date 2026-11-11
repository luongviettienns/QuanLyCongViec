import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TeamsService } from './teams.service.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { UpdateTeamDto } from './dto/update-team.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto.js';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@ApiTags('Teams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @ApiOperation({ summary: 'Tạo nhóm làm việc mới' })
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teamsService.create(user.id, dto);
  }

  @ApiOperation({ summary: 'Lấy danh sách các nhóm người dùng tham gia' })
  @Get()
  findAllForUser(@CurrentUser() user: AuthenticatedUser) {
    return this.teamsService.findAllForUser(user.id);
  }

  @ApiOperation({ summary: 'Lấy chi tiết một nhóm kèm danh sách thành viên' })
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.teamsService.findOne(user.id, id);
  }

  @ApiOperation({ summary: 'Lấy lịch sử hoạt động thành viên của nhóm (chỉ OWNER và ADMIN)' })
  @Get(':id/activity-logs')
  getActivityLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.teamsService.getActivityLogs(user.id, id);
  }

  @ApiOperation({ summary: 'Cập nhật thông tin nhóm' })
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.update(user.id, id, dto);
  }

  @ApiOperation({ summary: 'Chuyển quyền sở hữu nhóm (chỉ OWNER)' })
  @Patch(':id/transfer-ownership')
  transferOwnership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.teamsService.transferOwnership(user.id, id, dto);
  }

  @ApiOperation({ summary: 'Giải tán nhóm (chỉ OWNER)' })
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.teamsService.remove(user.id, id);
  }

  @ApiOperation({ summary: 'Thêm thành viên vào nhóm qua email' })
  @Post(':id/members')
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddMemberDto,
  ) {
    return this.teamsService.addMember(user.id, id, dto);
  }

  @ApiOperation({ summary: 'Cập nhật vai trò thành viên (chỉ OWNER)' })
  @Patch(':id/members/:memberId')
  updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.teamsService.updateMemberRole(user.id, id, memberId, dto);
  }

  @ApiOperation({ summary: 'Xóa thành viên khỏi nhóm hoặc tự rời nhóm' })
  @Delete(':id/members/:memberId')
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.teamsService.removeMember(user.id, id, memberId);
  }
}
