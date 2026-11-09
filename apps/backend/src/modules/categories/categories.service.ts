import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { Category, TeamRole } from '@prisma/client';

export interface FindCategoriesOptions {
  teamId?: number;
  scope?: 'all' | 'personal' | 'team';
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private isTeamMember(userId: number, team?: { ownerId: number; members?: { userId: number }[] } | null): boolean {
    if (!team) return false;
    return team.ownerId === userId || (team.members?.some((m) => m.userId === userId) ?? false);
  }

  private isTeamAdminOrOwner(
    userId: number,
    team?: { ownerId: number; members?: { userId: number; role: TeamRole }[] } | null,
  ): boolean {
    if (!team) return false;
    if (team.ownerId === userId) return true;
    return team.members?.some((m) => m.userId === userId && m.role === TeamRole.ADMIN) ?? false;
  }

  async findAll(userId: number, options?: FindCategoriesOptions): Promise<Category[]> {
    if (options?.teamId !== undefined) {
      const team = await this.prisma.team.findUnique({
        where: { id: options.teamId },
        include: { members: true },
      });

      if (!this.isTeamMember(userId, team)) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }

      return this.prisma.category.findMany({
        where: { teamId: options.teamId },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (options?.scope === 'all') {
      const userMemberships = await this.prisma.teamMember.findMany({
        where: { userId },
        select: { teamId: true },
      });
      const ownedTeams = await this.prisma.team.findMany({
        where: { ownerId: userId },
        select: { id: true },
      });

      const userTeamIds = Array.from(
        new Set([...userMemberships.map((m) => m.teamId), ...ownedTeams.map((t) => t.id)]),
      );

      return this.prisma.category.findMany({
        where: {
          OR: [
            { userId, teamId: null },
            { teamId: { in: userTeamIds } },
          ],
        },
        include: {
          team: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    // Default: Personal categories of the logged in user
    return this.prisma.category.findMany({
      where: { userId, teamId: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: number, userId: number): Promise<Category> {
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException('Mã danh mục (ID) phải là số nguyên dương hợp lệ');
    }

    const category = await this.prisma.category.findFirst({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException(`Không tìm thấy danh mục với mã #${id}`);
    }

    if (category.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: category.teamId },
        include: { members: true },
      });

      if (!this.isTeamMember(userId, team)) {
        throw new NotFoundException(`Không tìm thấy danh mục với mã #${id}`);
      }
    } else {
      if (category.userId !== userId) {
        throw new NotFoundException(`Không tìm thấy danh mục với mã #${id}`);
      }
    }

    return category;
  }

  async create(data: CreateCategoryDto, userId: number): Promise<Category> {
    const cleanName = data.name.trim();

    if (cleanName.length < 2) {
      throw new BadRequestException('Tên danh mục phải có ít nhất 2 ký tự');
    }

    const cleanColor = data.color
      ? (data.color.trim().startsWith('#') ? data.color.trim() : `#${data.color.trim()}`)
      : '#1890ff';

    if (data.teamId !== undefined && data.teamId !== null) {
      const team = await this.prisma.team.findUnique({
        where: { id: data.teamId },
        include: { members: true },
      });

      if (!this.isTeamMember(userId, team)) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }

      if (!this.isTeamAdminOrOwner(userId, team)) {
        throw new ForbiddenException('Chỉ Trưởng nhóm hoặc Quản trị viên mới có quyền tạo danh mục nhóm');
      }

      const existingInTeam = await this.prisma.category.findFirst({
        where: {
          teamId: data.teamId,
          name: {
            equals: cleanName,
            mode: 'insensitive',
          },
        },
      });

      if (existingInTeam) {
        throw new ConflictException(`Danh mục '${cleanName}' đã tồn tại trong nhóm`);
      }

      try {
        return await this.prisma.category.create({
          data: {
            name: cleanName,
            color: cleanColor,
            userId,
            teamId: data.teamId,
          },
        });
      } catch (error: any) {
        if (error?.code === 'P2002') {
          throw new ConflictException(`Danh mục '${cleanName}' đã tồn tại trong nhóm`);
        }
        throw error;
      }
    }

    // Personal category
    const existingPersonal = await this.prisma.category.findFirst({
      where: {
        userId,
        teamId: null,
        name: {
          equals: cleanName,
          mode: 'insensitive',
        },
      },
    });

    if (existingPersonal) {
      throw new ConflictException(`Danh mục '${cleanName}' đã tồn tại`);
    }

    try {
      return await this.prisma.category.create({
        data: {
          name: cleanName,
          color: cleanColor,
          userId,
          teamId: null,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(`Danh mục '${cleanName}' đã tồn tại`);
      }
      throw error;
    }
  }

  async update(id: number, data: UpdateCategoryDto, userId: number): Promise<Category> {
    const currentCategory = await this.findOne(id, userId);

    if (currentCategory.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: currentCategory.teamId },
        include: { members: true },
      });

      if (!this.isTeamAdminOrOwner(userId, team)) {
        throw new ForbiddenException('Chỉ Trưởng nhóm hoặc Quản trị viên mới có quyền chỉnh sửa danh mục nhóm');
      }
    } else {
      if (currentCategory.userId !== userId) {
        throw new ForbiddenException('Bạn không có quyền chỉnh sửa danh mục này');
      }
    }

    const updateData: { name?: string; color?: string } = {};

    if (data.name !== undefined) {
      const cleanName = data.name.trim();
      if (cleanName.length < 2) {
        throw new BadRequestException('Tên danh mục mới phải có ít nhất 2 ký tự');
      }

      const duplicateWhere = currentCategory.teamId
        ? {
            teamId: currentCategory.teamId,
            name: { equals: cleanName, mode: 'insensitive' as const },
            NOT: { id },
          }
        : {
            userId,
            teamId: null,
            name: { equals: cleanName, mode: 'insensitive' as const },
            NOT: { id },
          };

      const duplicate = await this.prisma.category.findFirst({
        where: duplicateWhere,
      });

      if (duplicate) {
        throw new ConflictException(`Danh mục '${cleanName}' đã tồn tại`);
      }

      updateData.name = cleanName;
    }

    if (data.color !== undefined) {
      const trimmed = data.color.trim();
      updateData.color = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    }

    try {
      return await this.prisma.category.update({
        where: { id },
        data: updateData,
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(`Danh mục '${data.name?.trim()}' đã tồn tại`);
      }
      throw error;
    }
  }

  async remove(id: number, userId: number): Promise<{ success: boolean; message: string; deletedCategory: Category }> {
    const categoryToDelete = await this.findOne(id, userId);

    if (categoryToDelete.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: categoryToDelete.teamId },
        include: { members: true },
      });

      if (!this.isTeamAdminOrOwner(userId, team)) {
        throw new ForbiddenException('Chỉ Trưởng nhóm hoặc Quản trị viên mới có quyền xóa danh mục nhóm');
      }
    } else {
      if (categoryToDelete.userId !== userId) {
        throw new ForbiddenException('Bạn không có quyền xóa danh mục này');
      }
    }

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
