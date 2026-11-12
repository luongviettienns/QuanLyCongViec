import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  getVietnamTodayDate,
  parseDateOnly,
  assertDateRangeValid,
  validateScopedCategory,
} from './task-validation.utils.js';

describe('task-validation.utils', () => {
  it('getVietnamTodayDate shifts UTC evening into next Asia/Ho_Chi_Minh calendar day', () => {
    // 2026-11-12T18:30:00.000Z is 2026-11-13 01:30:00 in Asia/Ho_Chi_Minh (UTC+7)
    const ref = new Date('2026-11-12T18:30:00.000Z');
    const vnToday = getVietnamTodayDate(ref);
    expect(vnToday.toISOString()).toBe('2026-11-13T00:00:00.000Z');
  });

  it('parseDateOnly parses YYYY-MM-DD as UTC midnight and rejects invalid calendar dates', () => {
    expect(parseDateOnly('2026-11-12').toISOString()).toBe('2026-11-12T00:00:00.000Z');
    expect(() => parseDateOnly('2026-02-30')).toThrow(BadRequestException);
    expect(() => parseDateOnly('12/11/2026')).toThrow(BadRequestException);
  });

  it('assertDateRangeValid throws when startDate is after dueDate', () => {
    const start = parseDateOnly('2026-11-15');
    const due = parseDateOnly('2026-11-10');
    expect(() => assertDateRangeValid(start, due)).toThrow(BadRequestException);
    expect(() => assertDateRangeValid(due, start)).not.toThrow();
    expect(() => assertDateRangeValid(start, start)).not.toThrow();
  });

  describe('validateScopedCategory', () => {
    it('passes when team category exists', async () => {
      const tx = {
        category: {
          findFirst: vi.fn().mockResolvedValue({ id: 10, teamId: 1 }),
        },
      } as any;
      await expect(validateScopedCategory(tx, 10, 1, [1])).resolves.toBeUndefined();
    });

    it('throws BadRequestException when team category does not exist', async () => {
      const tx = {
        category: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;
      await expect(validateScopedCategory(tx, 10, 1, [1])).rejects.toThrow(BadRequestException);
    });

    it('skips validation when unchanged team category is missing', async () => {
      const tx = {
        category: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;
      await expect(validateScopedCategory(tx, 10, 1, [1], 10)).resolves.toBeUndefined();
    });

    it('passes when personal category exists', async () => {
      const tx = {
        category: {
          findFirst: vi.fn().mockResolvedValue({ id: 10, userId: 1, teamId: null }),
        },
      } as any;
      await expect(validateScopedCategory(tx, 10, null, [1])).resolves.toBeUndefined();
    });

    it('throws NotFoundException when personal category does not exist', async () => {
      const tx = {
        category: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;
      await expect(validateScopedCategory(tx, 10, null, [1])).rejects.toThrow(NotFoundException);
    });

    it('skips validation when unchanged personal category is missing', async () => {
      const tx = {
        category: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;
      await expect(validateScopedCategory(tx, 10, null, [1], 10)).resolves.toBeUndefined();
    });
  });
});
