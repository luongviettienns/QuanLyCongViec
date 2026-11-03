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
import { ReorderTasksDto } from './dto/reorder-tasks.dto.js';
import { FilterTasksDto } from './dto/filter-tasks.dto.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(OptionalJwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @ApiOperation({ summary: 'Lấy danh sách toàn bộ công việc' })
  @Get()
  findAll(
    @Query() query: FilterTasksDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const userId = user?.id ?? 1;
    return this.tasksService.findAll(query, userId);
  }

  @ApiOperation({ summary: 'Sắp xếp lại thứ tự công việc theo vị trí mới' })
  @Patch('reorder')
  reorder(
    @Body() body: ReorderTasksDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const userId = user?.id ?? 1;
    return this.tasksService.reorder(body, userId);
  }

  @ApiOperation({ summary: 'Lấy chi tiết công việc theo ID' })
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const userId = user?.id ?? 1;
    return this.tasksService.findOne(id, userId);
  }

  @ApiOperation({ summary: 'Tạo công việc mới' })
  @Post()
  create(
    @Body() body: CreateTaskDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const userId = user?.id ?? 1;
    return this.tasksService.create(body, userId);
  }

  @ApiOperation({ summary: 'Cập nhật công việc theo ID' })
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTaskDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const userId = user?.id ?? 1;
    return this.tasksService.update(id, body, userId);
  }

  @ApiOperation({ summary: 'Xoá công việc theo ID' })
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const userId = user?.id ?? 1;
    return this.tasksService.remove(id, userId);
  }
}
