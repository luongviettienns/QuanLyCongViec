import type { Task, TaskPriority, TaskStatus } from '../types/task.types.ts';
import type { Team } from '../../teams/types/team.types.ts';
import type { User } from '../../auth/types/auth.types.ts';
import { getTaskPermissions } from './task-permission.utils.ts';

export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export type CalendarSubView = 'month' | 'week' | 'day' | 'agenda';

export interface CalendarDayCell {
  dateKey: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  /** Mon = 0 .. Sun = 6 */
  weekdayIndex: number;
}

export interface TaskDateSpan {
  startDateKey: string;
  dueDateKey: string;
  kind: 'range' | 'due_only' | 'start_only';
  durationDays: number;
}

export interface WeekTaskSegment {
  task: Task;
  span: TaskDateSpan;
  startCol: number;
  spanCols: number;
  laneIndex: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface CalendarStatusVisual {
  accent: string;
  softBg: string;
  textColor: string;
  borderColor: string;
  label: string;
}

export interface CalendarPriorityVisual {
  color: string;
  label: string;
}

export const CALENDAR_STATUS_VISUAL: Readonly<Record<TaskStatus, CalendarStatusVisual>> = {
  TODO: {
    accent: '#fa8c16',
    softBg: '#fff7e6',
    textColor: '#ad4e00',
    borderColor: '#ffd591',
    label: 'Cần làm',
  },
  IN_PROGRESS: {
    accent: '#1677ff',
    softBg: '#e6f4ff',
    textColor: '#003eb3',
    borderColor: '#91caff',
    label: 'Đang làm',
  },
  DONE: {
    accent: '#52c41a',
    softBg: '#f6ffed',
    textColor: '#595959',
    borderColor: '#b7eb8f',
    label: 'Hoàn thành',
  },
};

export const CALENDAR_PRIORITY_VISUAL: Readonly<Record<TaskPriority, CalendarPriorityVisual>> = {
  HIGH: { color: '#ff4d4f', label: 'Cao' },
  MEDIUM: { color: '#fa8c16', label: 'Trung bình' },
  LOW: { color: '#1677ff', label: 'Thấp' },
};

export const CALENDAR_WEEKDAY_SHORT_LABELS = [
  'T2',
  'T3',
  'T4',
  'T5',
  'T6',
  'T7',
  'CN',
] as const;

export const CALENDAR_WEEKDAY_FULL_LABELS = [
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
  'Chủ nhật',
] as const;

const PRIORITY_RANK: Readonly<Record<TaskPriority, number>> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

const MS_PER_DAY = 86400000;
const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_UTC_MIDNIGHT_REGEX = /^(\d{4})-(\d{2})-(\d{2})[T ]00:00:00(?:\.0+)?(?:Z|\+00:00)?$/i;

interface DateKeyParts {
  year: number;
  month: number;
  day: number;
}

const vnDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: VIETNAM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

function formatPartsToDateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateKeyParts(dateKey: string): DateKeyParts {
  const match = DATE_ONLY_REGEX.exec(dateKey);
  if (!match) {
    throw new Error(`Invalid dateKey: "${dateKey}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCalendarDate(year, month, day)) {
    throw new Error(`Invalid calendar dateKey: "${dateKey}"`);
  }
  return { year, month, day };
}

function formatDateInVietnam(date: Date): string | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const parts = vnDateFormatter.formatToParts(date);
  let year = '';
  let month = '';
  let day = '';
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
  }
  if (!year || !month || !day) {
    return null;
  }
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function toDateKey(value?: string | Date | null): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return formatDateInVietnam(value);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const directMatch = DATE_ONLY_REGEX.exec(trimmed) ?? ISO_UTC_MIDNIGHT_REGEX.exec(trimmed);
  if (directMatch) {
    const year = Number(directMatch[1]);
    const month = Number(directMatch[2]);
    const day = Number(directMatch[3]);
    return isValidCalendarDate(year, month, day)
      ? formatPartsToDateKey(year, month, day)
      : null;
  }

  const parsed = new Date(trimmed);
  return formatDateInVietnam(parsed);
}

export function getVietnamTodayKey(referenceDate: Date = new Date()): string {
  return formatDateInVietnam(referenceDate) ?? '1970-01-01';
}

export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const { year, month, day } = parseDateKeyParts(dateKey);
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return formatPartsToDateKey(
    utc.getUTCFullYear(),
    utc.getUTCMonth() + 1,
    utc.getUTCDate(),
  );
}

export function addMonthsToDateKey(dateKey: string, deltaMonths: number): string {
  const { year, month, day } = parseDateKeyParts(dateKey);
  const totalMonths = year * 12 + (month - 1) + deltaMonths;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;
  const daysInTargetMonth = new Date(
    Date.UTC(targetYear, targetMonthIndex + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);
  return formatPartsToDateKey(targetYear, targetMonthIndex + 1, clampedDay);
}

export function diffDateKeys(fromDateKey: string, toDateKeyValue: string): number {
  const from = parseDateKeyParts(fromDateKey);
  const to = parseDateKeyParts(toDateKeyValue);
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day);
  const toUtc = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toUtc - fromUtc) / MS_PER_DAY);
}

export function getWeekdayIndex(dateKey: string): number {
  const { year, month, day } = parseDateKeyParts(dateKey);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (jsDay + 6) % 7;
}

export function getWeekDays(
  anchorDateKey: string,
  todayKey: string = getVietnamTodayKey(),
): CalendarDayCell[] {
  const anchorMonthPrefix = anchorDateKey.slice(0, 7);
  const offsetFromMonday = getWeekdayIndex(anchorDateKey);
  const mondayKey = addDaysToDateKey(anchorDateKey, -offsetFromMonday);

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < 7; i += 1) {
    const dateKey = addDaysToDateKey(mondayKey, i);
    cells.push({
      dateKey,
      dayNumber: Number(dateKey.slice(8, 10)),
      isCurrentMonth: dateKey.slice(0, 7) === anchorMonthPrefix,
      isToday: dateKey === todayKey,
      weekdayIndex: i,
    });
  }
  return cells;
}

export function getMonthGridDays(
  anchorDateKey: string,
  todayKey: string = getVietnamTodayKey(),
): CalendarDayCell[] {
  const { year, month } = parseDateKeyParts(anchorDateKey);
  const anchorMonthPrefix = formatPartsToDateKey(year, month, 1).slice(0, 7);
  const firstOfMonthKey = formatPartsToDateKey(year, month, 1);
  const firstWeekdayIndex = getWeekdayIndex(firstOfMonthKey);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalWeeks = Math.max(5, Math.ceil((firstWeekdayIndex + daysInMonth) / 7));
  const totalCells = totalWeeks * 7;
  const gridStartKey = addDaysToDateKey(firstOfMonthKey, -firstWeekdayIndex);

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const dateKey = addDaysToDateKey(gridStartKey, i);
    cells.push({
      dateKey,
      dayNumber: Number(dateKey.slice(8, 10)),
      isCurrentMonth: dateKey.slice(0, 7) === anchorMonthPrefix,
      isToday: dateKey === todayKey,
      weekdayIndex: i % 7,
    });
  }
  return cells;
}

export function getTaskDateSpan(task: Task): TaskDateSpan | null {
  const startKey = toDateKey(task.startDate);
  const dueKey = toDateKey(task.dueDate);

  if (!startKey && !dueKey) {
    return null;
  }

  if (startKey && dueKey) {
    const orderedStart = startKey <= dueKey ? startKey : dueKey;
    const orderedDue = startKey <= dueKey ? dueKey : startKey;
    return {
      startDateKey: orderedStart,
      dueDateKey: orderedDue,
      kind: 'range',
      durationDays: diffDateKeys(orderedStart, orderedDue) + 1,
    };
  }

  if (dueKey) {
    return {
      startDateKey: dueKey,
      dueDateKey: dueKey,
      kind: 'due_only',
      durationDays: 1,
    };
  }

  return {
    startDateKey: startKey!,
    dueDateKey: startKey!,
    kind: 'start_only',
    durationDays: 1,
  };
}

export function doesTaskCoverDate(task: Task, dateKey: string): boolean {
  const span = getTaskDateSpan(task);
  if (!span) {
    return false;
  }
  return dateKey >= span.startDateKey && dateKey <= span.dueDateKey;
}

export function partitionCalendarTasks(tasks: Task[]): {
  scheduled: Task[];
  unscheduled: Task[];
} {
  const scheduled: Task[] = [];
  const unscheduled: Task[] = [];

  for (const task of tasks) {
    if (getTaskDateSpan(task)) {
      scheduled.push(task);
    } else {
      unscheduled.push(task);
    }
  }

  return { scheduled, unscheduled };
}

function compareTasksForCalendar(a: Task, b: Task): number {
  const aDone = a.status === 'DONE' ? 1 : 0;
  const bDone = b.status === 'DONE' ? 1 : 0;
  if (aDone !== bDone) {
    return aDone - bDone;
  }

  const aPriority = PRIORITY_RANK[a.priority ?? 'MEDIUM'] ?? PRIORITY_RANK.MEDIUM;
  const bPriority = PRIORITY_RANK[b.priority ?? 'MEDIUM'] ?? PRIORITY_RANK.MEDIUM;
  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  const aPos = a.position ?? Number.MAX_SAFE_INTEGER;
  const bPos = b.position ?? Number.MAX_SAFE_INTEGER;
  if (aPos !== bPos) {
    return aPos - bPos;
  }

  return a.id - b.id;
}

export function getTasksForDay(tasks: Task[], dateKey: string): Task[] {
  return tasks
    .filter((task) => doesTaskCoverDate(task, dateKey))
    .sort(compareTasksForCalendar);
}

export function packWeekTaskSegments(
  tasks: Task[],
  weekDays: CalendarDayCell[],
): WeekTaskSegment[] {
  if (weekDays.length === 0) {
    return [];
  }

  const weekStartKey = weekDays[0].dateKey;
  const weekEndKey = weekDays[weekDays.length - 1].dateKey;
  const dateToCol = new Map<string, number>();
  weekDays.forEach((cell, index) => {
    dateToCol.set(cell.dateKey, index);
  });

  const candidates: Array<Omit<WeekTaskSegment, 'laneIndex'>> = [];

  for (const task of tasks) {
    const span = getTaskDateSpan(task);
    if (!span) {
      continue;
    }
    if (span.startDateKey > weekEndKey || span.dueDateKey < weekStartKey) {
      continue;
    }

    const continuesBefore = span.startDateKey < weekStartKey;
    const continuesAfter = span.dueDateKey > weekEndKey;
    const clampedStart = continuesBefore ? weekStartKey : span.startDateKey;
    const clampedEnd = continuesAfter ? weekEndKey : span.dueDateKey;

    const startCol = dateToCol.get(clampedStart) ?? 0;
    const endCol = dateToCol.get(clampedEnd) ?? weekDays.length - 1;
    const spanCols = Math.max(1, endCol - startCol + 1);

    candidates.push({
      task,
      span,
      startCol,
      spanCols,
      continuesBefore,
      continuesAfter,
    });
  }

  candidates.sort((a, b) => {
    const aDone = a.task.status === 'DONE' ? 1 : 0;
    const bDone = b.task.status === 'DONE' ? 1 : 0;
    if (aDone !== bDone) {
      return aDone - bDone;
    }
    if (a.startCol !== b.startCol) {
      return a.startCol - b.startCol;
    }
    if (a.spanCols !== b.spanCols) {
      return b.spanCols - a.spanCols;
    }
    return compareTasksForCalendar(a.task, b.task);
  });

  const laneMasks: number[] = [];
  const packed: WeekTaskSegment[] = [];

  for (const seg of candidates) {
    const mask = ((1 << seg.spanCols) - 1) << seg.startCol;
    let laneIndex = laneMasks.findIndex((existing) => (existing & mask) === 0);
    if (laneIndex === -1) {
      laneIndex = laneMasks.length;
      laneMasks.push(mask);
    } else {
      laneMasks[laneIndex] |= mask;
    }

    packed.push({
      ...seg,
      laneIndex,
    });
  }

  packed.sort((a, b) => {
    if (a.laneIndex !== b.laneIndex) {
      return a.laneIndex - b.laneIndex;
    }
    return a.startCol - b.startCol;
  });

  return packed;
}

export function canDragCalendarTask(
  user: User | null | undefined,
  task: Task,
  teams?: Team[],
): boolean {
  const team = task.teamId
    ? (teams?.find((item) => item.id === task.teamId) ?? null)
    : null;
  return getTaskPermissions(user, task, team).canEditContent;
}

export function computeShiftedTaskDates(
  task: Task,
  targetDateKey: string,
): { startDate: string | null; dueDate: string | null } {
  // Validate targetDateKey early
  parseDateKeyParts(targetDateKey);

  const startKey = toDateKey(task.startDate);
  const dueKey = toDateKey(task.dueDate);

  if (startKey && dueKey) {
    const orderedStart = startKey <= dueKey ? startKey : dueKey;
    const orderedDue = startKey <= dueKey ? dueKey : startKey;
    const deltaDays = Math.max(0, diffDateKeys(orderedStart, orderedDue));
    return {
      startDate: addDaysToDateKey(targetDateKey, -deltaDays),
      dueDate: targetDateKey,
    };
  }

  if (dueKey) {
    return {
      startDate: null,
      dueDate: targetDateKey,
    };
  }

  if (startKey) {
    return {
      startDate: targetDateKey,
      dueDate: null,
    };
  }

  return {
    startDate: targetDateKey,
    dueDate: targetDateKey,
  };
}

export function formatDisplayDateKey(dateKey: string): string {
  const { year, month, day } = parseDateKeyParts(dateKey);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

export function formatTaskDateSpanLabel(task: Task): string {
  const span = getTaskDateSpan(task);
  if (!span) {
    return 'Chưa xếp ngày';
  }
  if (span.kind === 'range') {
    if (span.startDateKey === span.dueDateKey) {
      return formatDisplayDateKey(span.startDateKey);
    }
    return `${formatDisplayDateKey(span.startDateKey)} → ${formatDisplayDateKey(span.dueDateKey)}`;
  }
  if (span.kind === 'due_only') {
    return `Hạn: ${formatDisplayDateKey(span.dueDateKey)}`;
  }
  return `Bắt đầu: ${formatDisplayDateKey(span.startDateKey)}`;
}

export function formatCalendarHeaderTitle(
  subView: CalendarSubView,
  anchorDateKey: string,
): string {
  const { year, month, day } = parseDateKeyParts(anchorDateKey);

  if (subView === 'month' || subView === 'agenda') {
    return `Tháng ${month}/${year}`;
  }

  if (subView === 'week') {
    const week = getWeekDays(anchorDateKey, anchorDateKey);
    const first = parseDateKeyParts(week[0].dateKey);
    const last = parseDateKeyParts(week[6].dateKey);
    const dd1 = String(first.day).padStart(2, '0');
    const mm1 = String(first.month).padStart(2, '0');
    const dd2 = String(last.day).padStart(2, '0');
    const mm2 = String(last.month).padStart(2, '0');

    if (first.year !== last.year) {
      return `${dd1}/${mm1}/${first.year} – ${dd2}/${mm2}/${last.year}`;
    }
    return `${dd1}/${mm1} – ${dd2}/${mm2}/${last.year}`;
  }

  const weekdayLabel = CALENDAR_WEEKDAY_FULL_LABELS[getWeekdayIndex(anchorDateKey)];
  return `${weekdayLabel}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

export function formatAgendaDayLabel(
  dateKey: string,
  todayKey: string = getVietnamTodayKey(),
): string {
  const weekdayLabel = CALENDAR_WEEKDAY_FULL_LABELS[getWeekdayIndex(dateKey)];
  const formatted = formatDisplayDateKey(dateKey);
  const diff = diffDateKeys(todayKey, dateKey);

  if (diff === 0) {
    return `Hôm nay · ${weekdayLabel}, ${formatted}`;
  }
  if (diff === 1) {
    return `Ngày mai · ${weekdayLabel}, ${formatted}`;
  }
  if (diff === -1) {
    return `Hôm qua · ${weekdayLabel}, ${formatted}`;
  }
  return `${weekdayLabel}, ${formatted}`;
}

export function shiftAnchorDateKey(
  subView: CalendarSubView,
  anchorDateKey: string,
  direction: -1 | 1,
): string {
  if (subView === 'month' || subView === 'agenda') {
    return addMonthsToDateKey(anchorDateKey, direction);
  }
  if (subView === 'week') {
    return addDaysToDateKey(anchorDateKey, direction * 7);
  }
  return addDaysToDateKey(anchorDateKey, direction);
}

export function getScheduledAgendaDateKeys(
  tasks: Task[],
  options?: { monthAnchorKey?: string },
): string[] {
  let rangeMin: string | null = null;
  let rangeMax: string | null = null;

  if (options?.monthAnchorKey) {
    const { year, month } = parseDateKeyParts(options.monthAnchorKey);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    rangeMin = formatPartsToDateKey(year, month, 1);
    rangeMax = formatPartsToDateKey(year, month, daysInMonth);
  }

  const dateSet = new Set<string>();
  const MAX_SPAN_EXPAND_DAYS = 366;

  for (const task of tasks) {
    const span = getTaskDateSpan(task);
    if (!span) {
      continue;
    }

    let start = span.startDateKey;
    let end = span.dueDateKey;

    if (rangeMin && rangeMax) {
      if (end < rangeMin || start > rangeMax) {
        continue;
      }
      if (start < rangeMin) start = rangeMin;
      if (end > rangeMax) end = rangeMax;
    }

    const totalDays = diffDateKeys(start, end) + 1;
    if (totalDays > MAX_SPAN_EXPAND_DAYS) {
      dateSet.add(start);
      dateSet.add(end);
      continue;
    }

    for (let i = 0; i < totalDays; i += 1) {
      dateSet.add(addDaysToDateKey(start, i));
    }
  }

  return Array.from(dateSet).sort();
}
