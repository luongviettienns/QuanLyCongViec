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
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TasksService } from './tasks.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { ReorderTasksDto } from './dto/reorder-tasks.dto.js';
import { FilterTasksDto } from './dto/filter-tasks.dto.js';

@ApiTags('Tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @ApiOperation({ summary: 'Lấy danh sách toàn bộ công việc' })
  @Get()
  findAll(@Query() query: FilterTasksDto) {
    return this.tasksService.findAll(query);
  }

  // PATCH /tasks/reorder - Sắp xếp lại thứ tự công việc (đặt trước :id để không bị nhầm route)
  @ApiOperation({ summary: 'Sắp xếp lại thứ tự công việc theo vị trí mới' })
  @Patch('reorder')
  reorder(@Body() body: ReorderTasksDto) {
    return this.tasksService.reorder(body);
  }

  @ApiOperation({ summary: 'Lấy chi tiết công việc theo ID' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.findOne(id);
  }

  @ApiOperation({ summary: 'Tạo công việc mới' })
  @Post()
  create(@Body() body: CreateTaskDto) {
    return this.tasksService.create(body);
  }

  @ApiOperation({ summary: 'Cập nhật công việc theo ID' })
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasksService.update(id, body);
  }

  @ApiOperation({ summary: 'Xoá công việc theo ID' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.remove(id);
  }
}
