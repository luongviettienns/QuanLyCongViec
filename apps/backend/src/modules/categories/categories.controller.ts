import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@ApiTags('Categories')
@ApiBearerAuth()
@UseGuards(OptionalJwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách tất cả các danh mục' })
  @ApiResponse({ status: 200, description: 'Danh sách danh mục' })
  async findAll(@CurrentUser() user?: AuthenticatedUser) {
    const userId = user?.id ?? 1;
    return this.categoriesService.findAll(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết một danh mục theo ID' })
  @ApiResponse({ status: 200, description: 'Thông tin chi tiết danh mục' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy danh mục' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const userId = user?.id ?? 1;
    return this.categoriesService.findOne(id, userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo danh mục mới' })
  @ApiResponse({ status: 201, description: 'Tạo danh mục thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 409, description: 'Tên danh mục đã tồn tại' })
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const userId = user?.id ?? 1;
    return this.categoriesService.create(createCategoryDto, userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Cập nhật danh mục' })
  @ApiResponse({ status: 200, description: 'Cập nhật danh mục thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy danh mục' })
  @ApiResponse({ status: 409, description: 'Tên danh mục đã tồn tại' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const userId = user?.id ?? 1;
    return this.categoriesService.update(id, updateCategoryDto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xoá danh mục' })
  @ApiResponse({ status: 200, description: 'Xoá danh mục thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy danh mục' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const userId = user?.id ?? 1;
    return this.categoriesService.remove(id, userId);
  }
}
