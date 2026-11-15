import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto.js';
import { UpdateTaskAssigneeDto } from './dto/update-task-assignee.dto.js';
import { ReturnTaskDto } from './dto/return-task.dto.js';
import { MoveTaskTeamDto } from './dto/move-task-team.dto.js';
import { ReorderTasksDto } from './dto/reorder-tasks.dto.js';
import { FilterTasksDto } from './dto/filter-tasks.dto.js';
import { BulkTaskIdsDto } from './dto/bulk-task-ids.dto.js';
import { BulkUpdateTaskStatusDto } from './dto/bulk-update-task-status.dto.js';
import { EmptyTrashDto } from './dto/empty-trash.dto.js';
import { InviteCollaboratorDto } from './dto/invite-collaborator.dto.js';
import { RespondCollaboratorDto } from './dto/respond-collaborator.dto.js';
import { CreateSubtaskDto } from './dto/create-subtask.dto.js';
import { UpdateSubtaskDto } from './dto/update-subtask.dto.js';
import { UpdateSubtaskStatusDto } from './dto/update-subtask-status.dto.js';
import { ReorderSubtasksDto } from './dto/reorder-subtasks.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @ApiOperation({ summary: 'Lấy danh sách toàn bộ công việc' })
  @Get()
  findAll(
    @Query() query: FilterTasksDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.findAll(query, user.id);
  }

  @ApiOperation({ summary: 'Sắp xếp lại thứ tự công việc theo vị trí mới' })
  @Patch('reorder')
  reorder(
    @Body() body: ReorderTasksDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.reorder(body, user.id);
  }

  @ApiOperation({ summary: 'Lấy thống kê tổng quát công việc' })
  @Get('stats')
  getStats(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query?: FilterTasksDto,
  ) {
    return this.tasksService.getStats(user.id, query);
  }

  @ApiOperation({ summary: 'Lấy danh sách công việc trong thùng rác' })
  @Get('trash')
  findTrash(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query?: FilterTasksDto,
  ) {
    return this.tasksService.findTrash(query, user.id);
  }

  @ApiOperation({ summary: 'Cập nhật trạng thái hàng loạt cho nhiều công việc' })
  @Patch('bulk-status')
  bulkUpdateStatus(
    @Body() body: BulkUpdateTaskStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.bulkUpdateStatus(body, user.id);
  }

  @ApiOperation({ summary: 'Xoá mềm hàng loạt nhiều công việc vào thùng rác' })
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  bulkDelete(
    @Body() body: BulkTaskIdsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.bulkRemove(body.taskIds, user.id);
  }

  @ApiOperation({ summary: 'Khôi phục hàng loạt công việc từ thùng rác' })
  @Post('trash/bulk-restore')
  @HttpCode(HttpStatus.OK)
  bulkRestore(
    @Body() body: BulkTaskIdsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.bulkRestore(body.taskIds, user.id);
  }

  @ApiOperation({ summary: 'Xoá vĩnh viễn hàng loạt công việc trong thùng rác' })
  @Post('trash/bulk-permanent-delete')
  @HttpCode(HttpStatus.OK)
  bulkPermanentDelete(
    @Body() body: BulkTaskIdsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.bulkPermanentDelete(body.taskIds, user.id);
  }

  @ApiOperation({ summary: 'Dọn sạch các công việc có quyền quản lý trong thùng rác' })
  @Delete('trash/empty')
  emptyTrash(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query?: EmptyTrashDto,
  ) {
    return this.tasksService.emptyTrash(user.id, query?.teamId);
  }

  @ApiOperation({ summary: 'Lấy chi tiết công việc theo ID' })
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.findOne(id, user.id);
  }

  @ApiOperation({ summary: 'Tạo công việc mới' })
  @Post()
  create(
    @Body() body: CreateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.create(body, user.id);
  }

  @ApiOperation({ summary: 'Cập nhật công việc (nội dung, danh mục, nhóm, người thực hiện, trạng thái)' })
  @Patch(':id')
  patch(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.update(id, body, user.id);
  }

  @ApiOperation({ summary: 'Cập nhật trạng thái công việc (TODO, IN_PROGRESS, DONE)' })
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTaskStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.updateStatus(id, body, user.id);
  }

  @ApiOperation({ summary: 'Phân công hoặc thay đổi người thực hiện công việc' })
  @Patch(':id/assignee')
  updateAssignee(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTaskAssigneeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.updateAssignee(id, body, user.id);
  }

  @ApiOperation({ summary: 'Trả lại công việc cho người tạo (chỉ dành cho Assignee)' })
  @Patch(':id/return')
  returnTask(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReturnTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.returnTask(id, body, user.id);
  }

  @ApiOperation({ summary: 'Chuyển công việc sang nhóm khác hoặc về cá nhân' })
  @Patch(':id/team')
  moveTeam(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: MoveTaskTeamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.moveTeam(id, body, user.id);
  }

  @ApiOperation({ summary: 'Cập nhật công việc theo ID (tương thích ngược)' })
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.update(id, body, user.id);
  }

  @ApiOperation({ summary: 'Xoá công việc theo ID' })
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.remove(id, user.id);
  }

  @ApiOperation({ summary: 'Khôi phục công việc đã xoá mềm' })
  @Post(':id/restore')
  restore(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.restore(id, user.id);
  }

  @ApiOperation({ summary: 'Xoá vĩnh viễn công việc' })
  @Delete(':id/permanent')
  permanentDelete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.permanentDelete(id, user.id);
  }

  // ==================== COLLABORATORS ====================

  @ApiOperation({ summary: 'Lấy danh sách người phối hợp của công việc' })
  @Get(':id/collaborators')
  getCollaborators(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.getCollaborators(id, user.id);
  }

  @ApiOperation({ summary: 'Mời thành viên làm người phối hợp cho công việc' })
  @Post(':id/collaborators')
  inviteCollaborator(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: InviteCollaboratorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.inviteCollaborator(id, body, user.id);
  }

  @ApiOperation({ summary: 'Phản hồi lời mời phối hợp (ACCEPT hoặc DECLINE)' })
  @Post(':id/collaborators/respond')
  respondCollaboratorPost(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RespondCollaboratorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.respondCollaborator(id, body, user.id);
  }

  @ApiOperation({ summary: 'Phản hồi lời mời phối hợp (ACCEPT hoặc DECLINE) qua PATCH' })
  @Patch(':id/collaborators/respond')
  respondCollaboratorPatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RespondCollaboratorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.respondCollaborator(id, body, user.id);
  }

  @ApiOperation({ summary: 'Thu hồi lời mời hoặc gỡ người phối hợp khỏi công việc (hoặc tự rời)' })
  @Delete(':id/collaborators/:userId')
  removeCollaborator(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.removeCollaborator(id, targetUserId, user.id);
  }

  // ==================== SUBTASKS ====================

  @ApiOperation({ summary: 'Lấy danh sách công việc con (Subtasks)' })
  @Get(':id/subtasks')
  getSubtasks(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.getSubtasks(id, user.id);
  }

  @ApiOperation({ summary: 'Tạo công việc con mới' })
  @Post(':id/subtasks')
  createSubtask(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateSubtaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.createSubtask(id, body, user.id);
  }

  @ApiOperation({ summary: 'Sắp xếp lại thứ tự công việc con' })
  @Patch(':id/subtasks/reorder')
  reorderSubtasks(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReorderSubtasksDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.reorderSubtasks(id, body, user.id);
  }

  @ApiOperation({ summary: 'Cập nhật trạng thái công việc con' })
  @Patch(':id/subtasks/:subtaskId/status')
  updateSubtaskStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('subtaskId', ParseIntPipe) subtaskId: number,
    @Body() body: UpdateSubtaskStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.updateSubtaskStatus(id, subtaskId, body, user.id);
  }

  @ApiOperation({ summary: 'Cập nhật nội dung hoặc phân công công việc con' })
  @Patch(':id/subtasks/:subtaskId')
  updateSubtask(
    @Param('id', ParseIntPipe) id: number,
    @Param('subtaskId', ParseIntPipe) subtaskId: number,
    @Body() body: UpdateSubtaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.updateSubtask(id, subtaskId, body, user.id);
  }

  @ApiOperation({ summary: 'Xoá công việc con' })
  @Delete(':id/subtasks/:subtaskId')
  removeSubtask(
    @Param('id', ParseIntPipe) id: number,
    @Param('subtaskId', ParseIntPipe) subtaskId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.removeSubtask(id, subtaskId, user.id);
  }
}
