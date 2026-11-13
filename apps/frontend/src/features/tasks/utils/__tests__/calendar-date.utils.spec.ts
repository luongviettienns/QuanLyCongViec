import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysToDateKey,
  addMonthsToDateKey,
  canDragCalendarTask,
  computeShiftedTaskDates,
  diffDateKeys,
  doesTaskCoverDate,
  formatAgendaDayLabel,
  formatCalendarHeaderTitle,
  formatTaskDateSpanLabel,
  getMonthGridDays,
  getScheduledAgendaDateKeys,
  getTaskDateSpan,
  getTasksForDay,
  getVietnamTodayKey,
  getWeekDays,
  packWeekTaskSegments,
  partitionCalendarTasks,
  shiftAnchorDateKey,
  toDateKey,
} from '../calendar-date.utils.ts';
import type { Task } from '../../types/task.types.ts';
import type { Team } from '../../../teams/types/team.types.ts';
import type { User } from '../../../auth/types/auth.types.ts';

function makeTask(overrides: Partial<Task> & { id: number }): Task {
  return {
    title: `Task ${overrides.id}`,
    status: 'TODO',
    priority: 'MEDIUM',
    ...overrides,
  };
}

describe('calendar-date.utils', () => {
  describe('toDateKey & getVietnamTodayKey', () => {
    it('extracts YYYY-MM-DD from date strings, Prisma ISO midnights, and Date objects in Asia/Ho_Chi_Minh', () => {
      assert.equal(toDateKey('2026-11-12'), '2026-11-12');
      assert.equal(toDateKey('2026-11-12T00:00:00.000Z'), '2026-11-12');
      // 17:00 UTC is 00:00 next day in Asia/Ho_Chi_Minh (+07:00)
      assert.equal(toDateKey('2026-11-12T17:00:00.000Z'), '2026-11-13');
      assert.equal(toDateKey('2026-11-12T16:59:59.000Z'), '2026-11-12');
      assert.equal(toDateKey(new Date('2026-11-12T18:30:00.000Z')), '2026-11-13');
      assert.equal(getVietnamTodayKey(new Date('2026-11-12T17:05:00.000Z')), '2026-11-13');
      assert.equal(getVietnamTodayKey(new Date('2026-11-12T16:55:00.000Z')), '2026-11-12');
    });

    it('returns null for empty or invalid date inputs', () => {
      assert.equal(toDateKey(null), null);
      assert.equal(toDateKey(undefined), null);
      assert.equal(toDateKey(''), null);
      assert.equal(toDateKey('2026-02-30'), null);
      assert.equal(toDateKey('not-a-date'), null);
      assert.equal(toDateKey(new Date('invalid')), null);
    });
  });

  describe('addDaysToDateKey, addMonthsToDateKey, diffDateKeys', () => {
    it('adds and subtracts days across month, leap-year, and year boundaries', () => {
      assert.equal(addDaysToDateKey('2026-11-29', 3), '2026-12-02');
      assert.equal(addDaysToDateKey('2026-01-02', -3), '2025-12-30');
      assert.equal(addDaysToDateKey('2024-02-28', 1), '2024-02-29');
      assert.equal(addDaysToDateKey('2026-02-28', 1), '2026-03-01');
    });

    it('adds and subtracts months while clamping end-of-month dates', () => {
      assert.equal(addMonthsToDateKey('2026-01-31', 1), '2026-02-28');
      assert.equal(addMonthsToDateKey('2024-01-31', 1), '2024-02-29');
      assert.equal(addMonthsToDateKey('2026-03-31', -1), '2026-02-28');
      assert.equal(addMonthsToDateKey('2026-12-15', 1), '2027-01-15');
      assert.equal(addMonthsToDateKey('2026-01-15', -1), '2025-12-15');
    });

    it('computes signed day differences cleanly', () => {
      assert.equal(diffDateKeys('2026-11-10', '2026-11-12'), 2);
      assert.equal(diffDateKeys('2026-11-12', '2026-11-10'), -2);
      assert.equal(diffDateKeys('2026-11-10', '2026-11-10'), 0);
    });
  });

  describe('getWeekDays & getMonthGridDays', () => {
    it('returns 7 Mon-Sun cells for any anchor date in the week', () => {
      // 2026-11-12 is Thursday -> week is Mon 2026-11-09 .. Sun 2026-11-15
      const week = getWeekDays('2026-11-12', '2026-11-12');
      assert.equal(week.length, 7);
      assert.equal(week[0].dateKey, '2026-11-09');
      assert.equal(week[0].weekdayIndex, 0);
      assert.equal(week[3].dateKey, '2026-11-12');
      assert.equal(week[3].isToday, true);
      assert.equal(week[6].dateKey, '2026-11-15');
      assert.equal(week[6].weekdayIndex, 6);

      // Sunday anchor (2026-11-15) yields the exact same Mon-Sun week
      const fromSunday = getWeekDays('2026-11-15', '2026-11-12');
      assert.deepEqual(
        fromSunday.map((d) => d.dateKey),
        week.map((d) => d.dateKey),
      );
    });

    it('returns 35 or 42 Mon-Sun cells for month grid with current-month and today flags', () => {
      // Nov 2026 starts Sunday -> needs 6 rows = 42 cells (Mon 2026-10-26 .. Sun 2026-12-06)
      const nov = getMonthGridDays('2026-11-12', '2026-11-12');
      assert.equal(nov.length, 42);
      assert.equal(nov[0].dateKey, '2026-10-26');
      assert.equal(nov[0].isCurrentMonth, false);
      assert.equal(nov[0].weekdayIndex, 0);
      assert.equal(nov[6].dateKey, '2026-11-01');
      assert.equal(nov[6].isCurrentMonth, true);
      assert.equal(nov[6].weekdayIndex, 6);
      assert.equal(nov.find((c) => c.dateKey === '2026-11-12')?.isToday, true);
      assert.equal(nov[41].dateKey, '2026-12-06');
      assert.equal(nov[41].isCurrentMonth, false);

      // Dec 2026 starts Tuesday, 31 days -> 35 cells
      const dec = getMonthGridDays('2026-12-01', '2026-11-12');
      assert.equal(dec.length, 35);
      assert.equal(dec[0].dateKey, '2026-11-30');
      assert.equal(dec[34].dateKey, '2027-01-03');

      // Feb 2027 starts Monday, 28 days -> minimum 35 cells
      const feb27 = getMonthGridDays('2027-02-10', '2026-11-12');
      assert.equal(feb27.length, 35);
      assert.equal(feb27[0].dateKey, '2027-02-01');
    });
  });

  describe('getTaskDateSpan, doesTaskCoverDate, partitionCalendarTasks', () => {
    it('resolves range, due_only, start_only, and null spans accurately', () => {
      const rangeTask = makeTask({ id: 1, startDate: '2026-11-10', dueDate: '2026-11-12' });
      assert.deepEqual(getTaskDateSpan(rangeTask), {
        startDateKey: '2026-11-10',
        dueDateKey: '2026-11-12',
        kind: 'range',
        durationDays: 3,
      });

      const dueOnly = makeTask({ id: 2, startDate: null, dueDate: '2026-11-14T00:00:00.000Z' });
      assert.deepEqual(getTaskDateSpan(dueOnly), {
        startDateKey: '2026-11-14',
        dueDateKey: '2026-11-14',
        kind: 'due_only',
        durationDays: 1,
      });

      const startOnly = makeTask({ id: 3, startDate: '2026-11-08', dueDate: null });
      assert.deepEqual(getTaskDateSpan(startOnly), {
        startDateKey: '2026-11-08',
        dueDateKey: '2026-11-08',
        kind: 'start_only',
        durationDays: 1,
      });

      const unscheduled = makeTask({ id: 4, startDate: null, dueDate: null });
      assert.equal(getTaskDateSpan(unscheduled), null);

      // Inverted start/due dates normalize safely
      const inverted = makeTask({ id: 5, startDate: '2026-11-15', dueDate: '2026-11-12' });
      assert.deepEqual(getTaskDateSpan(inverted), {
        startDateKey: '2026-11-12',
        dueDateKey: '2026-11-15',
        kind: 'range',
        durationDays: 4,
      });
    });

    it('checks date coverage inclusively and partitions scheduled vs unscheduled tasks', () => {
      const t1 = makeTask({ id: 1, startDate: '2026-11-10', dueDate: '2026-11-12' });
      const t2 = makeTask({ id: 2, startDate: null, dueDate: null });

      assert.equal(doesTaskCoverDate(t1, '2026-11-09'), false);
      assert.equal(doesTaskCoverDate(t1, '2026-11-10'), true);
      assert.equal(doesTaskCoverDate(t1, '2026-11-11'), true);
      assert.equal(doesTaskCoverDate(t1, '2026-11-12'), true);
      assert.equal(doesTaskCoverDate(t1, '2026-11-13'), false);
      assert.equal(doesTaskCoverDate(t2, '2026-11-10'), false);

      const partitioned = partitionCalendarTasks([t1, t2]);
      assert.deepEqual(
        partitioned.scheduled.map((t) => t.id),
        [1],
      );
      assert.deepEqual(
        partitioned.unscheduled.map((t) => t.id),
        [2],
      );
    });
  });

  describe('getTasksForDay', () => {
    it('filters covering tasks and sorts by HIGH > MEDIUM > LOW with DONE always last', () => {
      const tasks: Task[] = [
        makeTask({ id: 1, priority: 'LOW', status: 'TODO', dueDate: '2026-11-12' }),
        makeTask({ id: 2, priority: 'HIGH', status: 'DONE', dueDate: '2026-11-12' }),
        makeTask({ id: 3, priority: 'MEDIUM', status: 'IN_PROGRESS', startDate: '2026-11-10', dueDate: '2026-11-15' }),
        makeTask({ id: 4, priority: 'HIGH', status: 'TODO', dueDate: '2026-11-12' }),
        makeTask({ id: 5, priority: 'LOW', status: 'DONE', dueDate: '2026-11-12' }),
        makeTask({ id: 6, priority: 'HIGH', status: 'TODO', dueDate: '2026-11-13' }), // different day
      ];

      const ordered = getTasksForDay(tasks, '2026-11-12');
      assert.deepEqual(
        ordered.map((t) => t.id),
        [4, 3, 1, 2, 5],
      );
    });
  });

  describe('packWeekTaskSegments', () => {
    it('clamps cross-week spans and assigns non-overlapping lanes greedily', () => {
      const weekDays = getWeekDays('2026-11-12', '2026-11-12'); // Mon 09 .. Sun 15
      const tasks: Task[] = [
        // Spans from previous week into Wednesday -> col 0..2, continuesBefore=true
        makeTask({ id: 1, startDate: '2026-11-06', dueDate: '2026-11-11', priority: 'MEDIUM' }),
        // Thursday to next week -> col 3..6, continuesAfter=true
        makeTask({ id: 2, startDate: '2026-11-12', dueDate: '2026-11-18', priority: 'HIGH' }),
        // Mon..Tue -> overlaps Task 1, must drop to lane 1
        makeTask({ id: 3, startDate: '2026-11-09', dueDate: '2026-11-10', priority: 'HIGH' }),
        // Wed only -> overlaps Task 1, fits lane 1 right after Task 3!
        makeTask({ id: 4, startDate: '2026-11-11', dueDate: '2026-11-11', priority: 'LOW' }),
        // DONE task spanning whole week -> placed after active lanes
        makeTask({ id: 5, startDate: '2026-11-09', dueDate: '2026-11-15', status: 'DONE', priority: 'HIGH' }),
      ];

      const segments = packWeekTaskSegments(tasks, weekDays);
      assert.equal(segments.length, 5);

      const byId = new Map(segments.map((s) => [s.task.id, s]));

      assert.equal(byId.get(1)?.startCol, 0);
      assert.equal(byId.get(1)?.spanCols, 3);
      assert.equal(byId.get(1)?.continuesBefore, true);
      assert.equal(byId.get(1)?.continuesAfter, false);
      assert.equal(byId.get(1)?.laneIndex, 0);

      // Task 2 starts col 3, doesn't overlap Task 1 (0..2), so shares lane 0!
      assert.equal(byId.get(2)?.startCol, 3);
      assert.equal(byId.get(2)?.spanCols, 4);
      assert.equal(byId.get(2)?.continuesBefore, false);
      assert.equal(byId.get(2)?.continuesAfter, true);
      assert.equal(byId.get(2)?.laneIndex, 0);

      // Task 3 (0..1) and Task 4 (2..2) share lane 1 without overlapping
      assert.equal(byId.get(3)?.laneIndex, 1);
      assert.equal(byId.get(4)?.laneIndex, 1);

      // DONE Task 5 sits below active tasks in lane 2
      assert.equal(byId.get(5)?.laneIndex, 2);
    });
  });

  describe('canDragCalendarTask', () => {
    const creator: User = { id: 10, email: 'c@test.com', name: 'Creator', createdAt: '', updatedAt: '' };
    const assignee: User = { id: 20, email: 'a@test.com', name: 'Assignee', createdAt: '', updatedAt: '' };
    const admin: User = { id: 30, email: 'ad@test.com', name: 'Admin', createdAt: '', updatedAt: '' };

    const team: Team = {
      id: 1,
      name: 'Core',
      ownerId: 99,
      createdAt: '',
      updatedAt: '',
      members: [
        { id: 1, teamId: 1, userId: 30, role: 'ADMIN', joinedAt: '', user: { id: 30, name: 'Admin', email: 'ad@test.com' } },
        { id: 2, teamId: 1, userId: 10, role: 'MEMBER', joinedAt: '', user: { id: 10, name: 'Creator', email: 'c@test.com' } },
        { id: 3, teamId: 1, userId: 20, role: 'MEMBER', joinedAt: '', user: { id: 20, name: 'Assignee', email: 'a@test.com' } },
      ],
    };

    it('allows dragging only when user has canEditContent and task is not DONE', () => {
      const personalTodo = makeTask({ id: 1, userId: 10, status: 'TODO' });
      const personalDone = makeTask({ id: 2, userId: 10, status: 'DONE' });
      assert.equal(canDragCalendarTask(creator, personalTodo, [team]), true);
      assert.equal(canDragCalendarTask(creator, personalDone, [team]), false);
      assert.equal(canDragCalendarTask(assignee, personalTodo, [team]), false);
      assert.equal(canDragCalendarTask(null, personalTodo, [team]), false);

      const teamTask = makeTask({ id: 3, userId: 10, assigneeId: 20, teamId: 1, status: 'IN_PROGRESS' });
      assert.equal(canDragCalendarTask(creator, teamTask, [team]), true);
      assert.equal(canDragCalendarTask(admin, teamTask, [team]), true);
      assert.equal(canDragCalendarTask(assignee, teamTask, [team]), false);
    });
  });

  describe('computeShiftedTaskDates', () => {
    it('preserves duration when shifting a range task', () => {
      const task = makeTask({ id: 1, startDate: '2026-11-10', dueDate: '2026-11-12' });
      assert.deepEqual(computeShiftedTaskDates(task, '2026-11-20'), {
        startDate: '2026-11-18',
        dueDate: '2026-11-20',
      });
    });

    it('shifts only dueDate for due_only tasks', () => {
      const task = makeTask({ id: 2, startDate: null, dueDate: '2026-11-10' });
      assert.deepEqual(computeShiftedTaskDates(task, '2026-11-15'), {
        startDate: null,
        dueDate: '2026-11-15',
      });
    });

    it('shifts only startDate for start_only tasks', () => {
      const task = makeTask({ id: 3, startDate: '2026-11-10', dueDate: null });
      assert.deepEqual(computeShiftedTaskDates(task, '2026-11-15'), {
        startDate: '2026-11-15',
        dueDate: null,
      });
    });

    it('sets both startDate and dueDate to targetDateKey for unscheduled tasks', () => {
      const task = makeTask({ id: 4, startDate: null, dueDate: null });
      assert.deepEqual(computeShiftedTaskDates(task, '2026-11-15'), {
        startDate: '2026-11-15',
        dueDate: '2026-11-15',
      });
    });
  });

  describe('Vietnamese header & agenda formatting + navigation helpers', () => {
    it('formats calendar header titles for month, week, day, and agenda', () => {
      assert.equal(formatCalendarHeaderTitle('month', '2026-11-12'), 'Tháng 11/2026');
      assert.equal(formatCalendarHeaderTitle('agenda', '2026-11-12'), 'Tháng 11/2026');
      assert.equal(formatCalendarHeaderTitle('week', '2026-11-12'), '09/11 – 15/11/2026');
      assert.equal(formatCalendarHeaderTitle('week', '2026-12-30'), '28/12/2026 – 03/01/2027');
      assert.equal(formatCalendarHeaderTitle('day', '2026-11-12'), 'Thứ 5, 12/11/2026');
      assert.equal(formatCalendarHeaderTitle('day', '2026-11-15'), 'Chủ nhật, 15/11/2026');
    });

    it('formats agenda day labels with relative Vietnamese markers', () => {
      const today = '2026-11-12';
      assert.equal(formatAgendaDayLabel('2026-11-12', today), 'Hôm nay · Thứ 5, 12/11/2026');
      assert.equal(formatAgendaDayLabel('2026-11-13', today), 'Ngày mai · Thứ 6, 13/11/2026');
      assert.equal(formatAgendaDayLabel('2026-11-11', today), 'Hôm qua · Thứ 4, 11/11/2026');
      assert.equal(formatAgendaDayLabel('2026-11-15', today), 'Chủ nhật, 15/11/2026');
    });

    it('shifts anchor date keys appropriately per subView and extracts sorted agenda dates', () => {
      assert.equal(shiftAnchorDateKey('month', '2026-01-31', 1), '2026-02-28');
      assert.equal(shiftAnchorDateKey('agenda', '2026-11-12', -1), '2026-10-12');
      assert.equal(shiftAnchorDateKey('week', '2026-11-12', 1), '2026-11-19');
      assert.equal(shiftAnchorDateKey('day', '2026-11-12', -1), '2026-11-11');

      const tasks = [
        makeTask({ id: 1, startDate: '2026-11-29', dueDate: '2026-12-02' }),
        makeTask({ id: 2, dueDate: '2026-11-15' }),
        makeTask({ id: 3, startDate: null, dueDate: null }),
      ];
      assert.deepEqual(
        getScheduledAgendaDateKeys(tasks, { monthAnchorKey: '2026-11-12' }),
        ['2026-11-15', '2026-11-29', '2026-11-30'],
      );
      assert.deepEqual(
        getScheduledAgendaDateKeys(tasks),
        ['2026-11-15', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'],
      );
    });

    it('formats concise Vietnamese task date span labels', () => {
      assert.equal(
        formatTaskDateSpanLabel(makeTask({ id: 1, startDate: '2026-11-10', dueDate: '2026-11-12' })),
        '10/11/2026 → 12/11/2026',
      );
      assert.equal(
        formatTaskDateSpanLabel(makeTask({ id: 2, startDate: '2026-11-10', dueDate: '2026-11-10' })),
        '10/11/2026',
      );
      assert.equal(
        formatTaskDateSpanLabel(makeTask({ id: 3, startDate: null, dueDate: '2026-11-12' })),
        'Hạn: 12/11/2026',
      );
      assert.equal(
        formatTaskDateSpanLabel(makeTask({ id: 4, startDate: '2026-11-09', dueDate: null })),
        'Bắt đầu: 09/11/2026',
      );
      assert.equal(
        formatTaskDateSpanLabel(makeTask({ id: 5, startDate: null, dueDate: null })),
        'Chưa xếp ngày',
      );
    });
  });
});
