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
}
