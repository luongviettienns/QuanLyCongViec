import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

/**
 * Returns 00:00:00.000Z representing the current calendar day in Asia/Ho_Chi_Minh.
 * Shared across TaskStatsService and TaskQueryService so stat cards and task filters match.
 */
export function getVietnamTodayDate(referenceDate: Date = new Date()): Date {
  const vnDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [vnYear, vnMonth, vnDay] = vnDateFormatter
    .format(referenceDate)
    .split('-')
    .map((part) => parseInt(part, 10));

  return new Date(Date.UTC(vnYear, vnMonth - 1, vnDay));
}

export function parseDateOnly(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) {
    throw new BadRequestException('Định dạng ngày phải là YYYY-MM-DD');
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException('Ngày không hợp lệ trong lịch');
  }
  return date;
}

export function assertDateRangeValid(startDate: Date | null, dueDate: Date | null): void {
  if (startDate && dueDate && startDate > dueDate) {
    throw new BadRequestException('Ngày bắt đầu không được lớn hơn hạn chót (deadline)');
  }
}

export async function validateScopedCategory(
  tx: Prisma.TransactionClient,
  categoryId: number,
  teamId: number | null,
  personalUserIds: number[],
  skipIfUnchangedId?: number | null,
): Promise<void> {
  if (teamId) {
    const category = await tx.category.findFirst({
      where: { id: categoryId, teamId },
    });
    if (!category && skipIfUnchangedId !== categoryId) {
      throw new BadRequestException(`Danh mục #${categoryId} không thuộc nhóm này`);
    }
    return;
  }

  const category = await tx.category.findFirst({
    where: {
      id: categoryId,
      userId: { in: personalUserIds },
      teamId: null,
    },
  });
  if (!category && skipIfUnchangedId !== categoryId) {
    throw new NotFoundException(`Không tìm thấy danh mục với mã #${categoryId}`);
  }
}
