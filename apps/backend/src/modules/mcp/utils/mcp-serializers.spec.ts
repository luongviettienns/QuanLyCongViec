import { describe, it, expect } from 'vitest';
import {
  clampLimit,
  formatDateOnly,
  serializeTaskSummary,
  serializeTaskDetail,
  serializeTeamSummary,
  serializeTeamDetail,
  serializeNotificationItem,
  formatMcpErrorMessage,
} from './mcp-serializers.js';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('mcp-serializers', () => {
  it('clamps limits safely to [1, max] with default fallback', () => {
    expect(clampLimit(undefined, 30, 100)).toBe(30);
    expect(clampLimit(0, 30, 100)).toBe(1);
    expect(clampLimit(-5, 30, 100)).toBe(1);
    expect(clampLimit(250, 30, 100)).toBe(100);
    expect(clampLimit(15.7, 30, 100)).toBe(15);
  });

  it('formats Date or ISO strings to YYYY-MM-DD date-only strings', () => {
    expect(formatDateOnly(new Date('2026-11-18T00:00:00.000Z'))).toBe('2026-11-18');
    expect(formatDateOnly('2026-11-25T12:30:00.000Z')).toBe('2026-11-25');
    expect(formatDateOnly(null)).toBeNull();
    expect(formatDateOnly(undefined)).toBeNull();
  });

  it('serializes task summary and detail with checklist counts and without leaking sensitive fields', () => {
    const rawTask = {
      id: 42,
      title: 'Implement MCP',
      description: 'Read-only tools',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      startDate: new Date('2026-11-18T00:00:00.000Z'),
      dueDate: new Date('2026-11-20T00:00:00.000Z'),
      userId: 1,
      teamId: 5,
      team: { id: 5, name: 'Platform', ownerId: 1 },
      assigneeId: 2,
      assignee: { id: 2, name: 'Binh', email: 'binh@test.com', passwordHash: 'SECRET' },
      categoryId: 9,
      category: { id: 9, name: 'Backend', color: '#1677ff' },
      subtasks: [
        { id: 101, title: 'Step 1', status: 'DONE', position: 0, assigneeId: 2, assignee: { id: 2, name: 'Binh' } },
        { id: 102, title: 'Step 2', status: 'TODO', position: 1, assigneeId: null, assignee: null },
      ],
      collaborators: [
        { userId: 3, status: 'ACCEPTED', user: { id: 3, name: 'Chi', email: 'chi@test.com' } },
      ],
      createdAt: new Date('2026-11-17T08:00:00.000Z'),
      updatedAt: new Date('2026-11-18T08:00:00.000Z'),
    };

    const summary = serializeTaskSummary(rawTask);
    expect(summary).toEqual({
      id: 42,
      title: 'Implement MCP',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      startDate: '2026-11-18',
      dueDate: '2026-11-20',
      team: { id: 5, name: 'Platform' },
      assignee: { id: 2, name: 'Binh' },
      category: { id: 9, name: 'Backend' },
      checklist: { completed: 1, total: 2 },
    });
    expect(JSON.stringify(summary)).not.toContain('SECRET');

    const detail = serializeTaskDetail(rawTask);
    expect(detail.description).toBe('Read-only tools');
    expect(detail.subtasks).toHaveLength(2);
    expect(detail.collaborators).toEqual([{ userId: 3, name: 'Chi', status: 'ACCEPTED' }]);
    expect(JSON.stringify(detail)).not.toContain('SECRET');
  });

  it('serializes team summary, team detail, notifications, and NestJS error messages cleanly', () => {
    const team = {
      id: 5,
      name: 'Platform',
      description: 'Core team',
      ownerId: 1,
      owner: { id: 1, name: 'An', email: 'an@test.com' },
      members: [
        { userId: 1, role: 'ADMIN', user: { id: 1, name: 'An', email: 'an@test.com' } },
        { userId: 2, role: 'MEMBER', user: { id: 2, name: 'Binh', email: 'binh@test.com' } },
      ],
      _count: { members: 2, tasks: 7 },
    };

    expect(serializeTeamSummary(team, 2)).toEqual({
      id: 5,
      name: 'Platform',
      description: 'Core team',
      myRole: 'MEMBER',
      owner: { id: 1, name: 'An' },
      memberCount: 2,
      taskCount: 7,
    });

    const teamDetail = serializeTeamDetail(team, 1);
    expect(teamDetail.myRole).toBe('OWNER');
    expect(teamDetail.members).toEqual([
      { userId: 1, name: 'An', role: 'OWNER' },
      { userId: 2, name: 'Binh', role: 'MEMBER' },
    ]);

    const notif = serializeNotificationItem({
      id: 99,
      type: 'TASK_OVERDUE',
      title: 'Quá hạn',
      content: 'Task #42 quá hạn',
      isRead: false,
      taskId: 42,
      subtaskId: null,
      teamId: 5,
      actor: { id: 1, name: 'An', email: 'an@test.com' },
      createdAt: new Date('2026-11-18T07:00:00.000Z'),
    });
    expect(notif.id).toBe(99);
    expect(notif.actor).toEqual({ id: 1, name: 'An' });

    expect(formatMcpErrorMessage(new NotFoundException('Không tìm thấy công việc'))).toBe(
      'Không tìm thấy công việc',
    );
    expect(formatMcpErrorMessage(new ForbiddenException('Không có quyền'))).toBe('Không có quyền');
    expect(
      formatMcpErrorMessage(new BadRequestException(['Lỗi 1', 'Lỗi 2'])),
    ).toBe('Lỗi 1; Lỗi 2');
    expect(formatMcpErrorMessage(new Error('DB raw failure'))).toBe(
      'Không thể thực thi yêu cầu MCP lúc này',
    );
  });
});
