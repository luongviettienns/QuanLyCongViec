import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { Category } from '@prisma/client';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: number): Promise<Category[]> {
    const count = await this.prisma.category.count({
      where: { userId },
    });

    if (count === 0) {
      await this.prisma.category.createMany({
        data: [
          { name: 'Công việc', color: '#1890ff', userId },
          { name: 'Học tập', color: '#52c41a', userId },
          { name: 'Cá nhân', color: '#fa8c16', userId },
        ],
      });
    }

    return this.prisma.category.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: number, userId: number): Promise<Category> {
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException('Mã danh mục (ID) phải là số nguyên dương hợp lệ');
    }

    const category = await this.prisma.category.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!category) {
      throw new NotFoundException(`Không tìm thấy danh mục với mã #${id}`);
    }

    return category;
  }

  async create(data: CreateCategoryDto, userId: number): Promise<Category> {
    const cleanName = data.name.trim();

    if (cleanName.length < 2) {
      throw new BadRequestException('Tên danh mục phải có ít nhất 2 ký tự');
    }

    const existingCategory = await this.prisma.category.findFirst({
      where: {
        userId,
        name: {
          equals: cleanName,
          mode: 'insensitive',
        },
      },
    });

    if (existingCategory) {
      throw new ConflictException(`Danh mục '${cleanName}' đã tồn tại`);
    }

    const cleanColor = data.color ? data.color.trim() : '#1890ff';

    return this.prisma.category.create({
      data: {
        name: cleanName,
        color: cleanColor,
        userId,
      },
    });
  }

  async update(id: number, data: UpdateCategoryDto, userId: number): Promise<Category> {
    await this.findOne(id, userId);

    const updateData: { name?: string; color?: string } = {};

    if (data.name !== undefined) {
      const cleanName = data.name.trim();
      if (cleanName.length < 2) {
        throw new BadRequestException('Tên danh mục mới phải có ít nhất 2 ký tự');
      }

      const duplicate = await this.prisma.category.findFirst({
        where: {
          userId,
          name: {
            equals: cleanName,
            mode: 'insensitive',
          },
          NOT: { id },
        },
      });

      if (duplicate) {
        throw new ConflictException(`Danh mục '${cleanName}' đã tồn tại`);
      }

      updateData.name = cleanName;
    }

    if (data.color !== undefined) {
      updateData.color = data.color.trim();
    }

    return this.prisma.category.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: number, userId: number): Promise<{ success: boolean; message: string; deletedCategory: Category }> {
    const categoryToDelete = await this.findOne(id, userId);

    const deletedCategory = await this.prisma.category.delete({
      where: { id },
    });

    return {
      success: true,
      message: `Đã xoá danh mục "${categoryToDelete.name}" thành công`,
      deletedCategory,
    };
  }
}
