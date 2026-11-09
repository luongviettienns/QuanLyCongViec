import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoriesService } from './categories.service.js';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { TeamRole } from '@prisma/client';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let mockPrisma: any;

  const mockTeam = {
    id: 1,
    name: 'Dev Team',
    ownerId: 10,
    members: [{ userId: 10, role: TeamRole.ADMIN }, { userId: 20, role: TeamRole.MEMBER }],
  };

  beforeEach(() => {
    mockPrisma = {
      category: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      team: {
        findUnique: vi.fn(),
      },
      teamMember: {
        findMany: vi.fn(),
      },
    };
    service = new CategoriesService(mockPrisma);
  });

  describe('findAll', () => {
    it('returns personal categories when teamId is not specified', async () => {
      const personalCats = [{ id: 1, name: 'Personal 1', userId: 10, teamId: null }];
      mockPrisma.category.findMany.mockResolvedValue(personalCats);

      const result = await service.findAll(10);
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
        where: { userId: 10, teamId: null },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual(personalCats);
    });

    it('throws NotFoundException if user is not a member of teamId', async () => {
      mockPrisma.team.findUnique.mockResolvedValue({
        id: 99,
        ownerId: 5,
        members: [{ userId: 5, role: TeamRole.ADMIN }],
      });

      await expect(service.findAll(10, { teamId: 99 })).rejects.toThrow(NotFoundException);
    });

    it('returns team categories when user is a team member', async () => {
      mockPrisma.team.findUnique.mockResolvedValue(mockTeam);
      const teamCats = [{ id: 2, name: 'Bug', userId: 10, teamId: 1 }];
      mockPrisma.category.findMany.mockResolvedValue(teamCats);

      const result = await service.findAll(20, { teamId: 1 });
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
        where: { teamId: 1 },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual(teamCats);
    });

    it('returns all categories (personal + team) when scope=all', async () => {
      mockPrisma.teamMember.findMany.mockResolvedValue([{ teamId: 1 }]);
      mockPrisma.team.findMany = vi.fn().mockResolvedValue([{ id: 1 }]);
      const allCats = [
        { id: 1, name: 'Personal', userId: 10, teamId: null },
        { id: 2, name: 'Bug', userId: 10, teamId: 1 },
      ];
      mockPrisma.category.findMany.mockResolvedValue(allCats);

      const result = await service.findAll(10, { scope: 'all' });
      expect(mockPrisma.category.findMany).toHaveBeenCalled();
      expect(result).toEqual(allCats);
    });
  });

  describe('findOne', () => {
    it('returns personal category for owner', async () => {
      const cat = { id: 1, name: 'Personal', userId: 10, teamId: null };
      mockPrisma.category.findFirst.mockResolvedValue(cat);

      const result = await service.findOne(1, 10);
      expect(result).toEqual(cat);
    });

    it('returns team category for any team member', async () => {
      const cat = { id: 2, name: 'Feature', userId: 10, teamId: 1 };
      mockPrisma.category.findFirst.mockResolvedValue(cat);
      mockPrisma.team.findUnique.mockResolvedValue(mockTeam);

      const result = await service.findOne(2, 20); // user 20 is member
      expect(result).toEqual(cat);
    });

    it('throws NotFoundException for non-member of team category', async () => {
      const cat = { id: 2, name: 'Feature', userId: 10, teamId: 1 };
      mockPrisma.category.findFirst.mockResolvedValue(cat);
      mockPrisma.team.findUnique.mockResolvedValue(mockTeam);

      await expect(service.findOne(2, 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a personal category successfully', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(null);
      mockPrisma.category.create.mockResolvedValue({
        id: 1,
        name: 'Study',
        color: '#1890ff',
        userId: 10,
        teamId: null,
      });

      const result = await service.create({ name: 'Study' }, 10);
      expect(result.name).toBe('Study');
      expect(mockPrisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Study',
          userId: 10,
          teamId: null,
        }),
      });
    });

    it('forbids normal team MEMBER from creating team category', async () => {
      mockPrisma.team.findUnique.mockResolvedValue(mockTeam);

      await expect(
        service.create({ name: 'DevOps', teamId: 1 }, 20), // user 20 is MEMBER
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows team ADMIN / OWNER to create team category', async () => {
      mockPrisma.team.findUnique.mockResolvedValue(mockTeam);
      mockPrisma.category.findFirst.mockResolvedValue(null);
      mockPrisma.category.create.mockResolvedValue({
        id: 5,
        name: 'Urgent',
        color: '#f5222d',
        userId: 10,
        teamId: 1,
      });

      const result = await service.create({ name: 'Urgent', color: '#f5222d', teamId: 1 }, 10);
      expect(result.teamId).toBe(1);
      expect(mockPrisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Urgent',
          teamId: 1,
          userId: 10,
        }),
      });
    });

    it('rejects duplicate category name within the same team', async () => {
      mockPrisma.team.findUnique.mockResolvedValue(mockTeam);
      mockPrisma.category.findFirst.mockResolvedValue({ id: 2, name: 'Urgent', teamId: 1 });

      await expect(
        service.create({ name: 'urgent', teamId: 1 }, 10),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('forbids normal team member from updating team category', async () => {
      const cat = { id: 2, name: 'Urgent', teamId: 1, userId: 10 };
      mockPrisma.category.findFirst.mockResolvedValue(cat);
      mockPrisma.team.findUnique.mockResolvedValue(mockTeam);

      await expect(
        service.update(2, { name: 'Urgent New' }, 20), // user 20 is MEMBER
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows team admin to update team category', async () => {
      const cat = { id: 2, name: 'Urgent', teamId: 1, userId: 10 };
      mockPrisma.category.findFirst
        .mockResolvedValueOnce(cat) // findOne
        .mockResolvedValueOnce(null); // duplicate check
      mockPrisma.team.findUnique.mockResolvedValue(mockTeam);
      mockPrisma.category.update.mockResolvedValue({ ...cat, name: 'Urgent Hotfix' });

      const result = await service.update(2, { name: 'Urgent Hotfix' }, 10);
      expect(result.name).toBe('Urgent Hotfix');
    });
  });

  describe('remove', () => {
    it('forbids normal team member from deleting team category', async () => {
      const cat = { id: 2, name: 'Urgent', teamId: 1, userId: 10 };
      mockPrisma.category.findFirst.mockResolvedValue(cat);
      mockPrisma.team.findUnique.mockResolvedValue(mockTeam);

      await expect(service.remove(2, 20)).rejects.toThrow(ForbiddenException);
    });

    it('allows team admin to delete team category', async () => {
      const cat = { id: 2, name: 'Urgent', teamId: 1, userId: 10 };
      mockPrisma.category.findFirst.mockResolvedValue(cat);
      mockPrisma.team.findUnique.mockResolvedValue(mockTeam);
      mockPrisma.category.delete.mockResolvedValue(cat);

      const result = await service.remove(2, 10);
      expect(result.success).toBe(true);
      expect(mockPrisma.category.delete).toHaveBeenCalledWith({ where: { id: 2 } });
    });
  });
});
