import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDeadlineDisplayState } from '../date.utils.ts';

describe('date.utils getDeadlineDisplayState', () => {
  const ref = new Date('2026-11-12T10:00:00.000Z');

  it('classifies overdue, today, soon (1..3 days), normal, and suppresses alerts when DONE', () => {
    assert.deepEqual(getDeadlineDisplayState('2026-11-10', 'TODO', ref), {
      state: 'overdue',
      formatted: '10/11/2026',
      badgeText: 'Quá hạn',
      color: 'error',
    });
    assert.deepEqual(getDeadlineDisplayState('2026-11-12', 'IN_PROGRESS', ref), {
      state: 'today',
      formatted: '12/11/2026',
      badgeText: 'Hôm nay',
      color: 'warning',
    });
    assert.deepEqual(getDeadlineDisplayState('2026-11-14', 'TODO', ref), {
      state: 'soon',
      formatted: '14/11/2026',
      badgeText: 'Còn 2 ngày',
      color: 'gold',
    });
    assert.deepEqual(getDeadlineDisplayState('2026-11-25', 'TODO', ref), {
      state: 'normal',
      formatted: '25/11/2026',
      badgeText: undefined,
      color: 'default',
    });
    assert.deepEqual(getDeadlineDisplayState('2026-11-01', 'DONE', ref), {
      state: 'normal',
      formatted: '01/11/2026',
      badgeText: undefined,
      color: 'default',
    });
  });
});
