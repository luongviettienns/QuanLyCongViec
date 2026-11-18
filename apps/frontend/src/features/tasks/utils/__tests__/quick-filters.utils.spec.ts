import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultTaskFilters,
  applyFilterPatch,
} from '../task-filter.utils.ts';
import {
  buildQuickFilterChips,
  toggleQuickFilterPatch,
  buildActiveFilterChips,
} from '../quick-filters.utils.ts';
import type { Team } from '../../../teams/types/team.types.ts';
import type { Category } from '../../../categories/types/category.types.ts';

describe('quick-filters.utils', () => {
  it('buildQuickFilterChips returns active-mode chips and hides pending_invites when count is 0 and inactive', () => {
    const base = createDefaultTaskFilters();
    const chips = buildQuickFilterChips(base, { isTrash: false, pendingInvitesCount: 0 });
    assert.deepEqual(
      chips.map((c) => c.id),
      ['my_work', 'today', 'overdue', 'due_soon', 'high_priority', 'incomplete'],
    );
    assert.equal(chips.every((c) => !c.active), true);

    const withInvites = buildQuickFilterChips(base, { isTrash: false, pendingInvitesCount: 3 });
    const inviteChip = withInvites.find((c) => c.id === 'pending_invites');
    assert.ok(inviteChip);
    assert.equal(inviteChip.count, 3);
    assert.equal(inviteChip.active, false);

    // Still shown when pending_invites scope is currently active even if count drops to 0
    const activeInviteScope = applyFilterPatch(base, { scopeFilter: 'pending_invites' });
    const chipsWhenActive = buildQuickFilterChips(activeInviteScope, {
      isTrash: false,
      pendingInvitesCount: 0,
    });
    const activeInviteChip = chipsWhenActive.find((c) => c.id === 'pending_invites');
    assert.ok(activeInviteChip);
    assert.equal(activeInviteChip.active, true);
  });

  it('buildQuickFilterChips only exposes high_priority in trash mode', () => {
    const highTrash = applyFilterPatch(createDefaultTaskFilters(), {
      priorityFilter: 'HIGH',
      deadlineFilter: 'overdue',
      scopeFilter: 'my_work',
    });
    const chips = buildQuickFilterChips(highTrash, { isTrash: true, pendingInvitesCount: 5 });
    assert.deepEqual(
      chips.map((c) => ({ id: c.id, active: c.active })),
      [{ id: 'high_priority', active: true }],
    );
  });

  it('toggleQuickFilterPatch toggles chips on/off, composes across dimensions, and resolves DONE <-> deadline conflicts', () => {
    let state = createDefaultTaskFilters();

    // Compose: Của tôi + Quá hạn + Ưu tiên cao + Chưa hoàn thành
    state = applyFilterPatch(state, toggleQuickFilterPatch(state, 'my_work'));
    state = applyFilterPatch(state, toggleQuickFilterPatch(state, 'overdue'));
    state = applyFilterPatch(state, toggleQuickFilterPatch(state, 'high_priority'));
    state = applyFilterPatch(state, toggleQuickFilterPatch(state, 'incomplete'));

    assert.equal(state.scopeFilter, 'my_work');
    assert.equal(state.deadlineFilter, 'overdue');
    assert.equal(state.priorityFilter, 'HIGH');
    assert.equal(state.statusFilter, 'INCOMPLETE');

    // Switching deadline chip from overdue -> today preserves other dimensions
    state = applyFilterPatch(state, toggleQuickFilterPatch(state, 'today'));
    assert.equal(state.deadlineFilter, 'today');
    assert.equal(state.scopeFilter, 'my_work');
    assert.equal(state.priorityFilter, 'HIGH');
    assert.equal(state.statusFilter, 'INCOMPLETE');

    // Clicking active chip toggles it off
    state = applyFilterPatch(state, toggleQuickFilterPatch(state, 'today'));
    assert.equal(state.deadlineFilter, 'ALL');

    // Selecting DONE clears open-deadline filter automatically
    state = applyFilterPatch(state, toggleQuickFilterPatch(state, 'due_soon'));
    assert.equal(state.deadlineFilter, 'due_soon');
    state = applyFilterPatch(state, { statusFilter: 'DONE' });
    assert.equal(state.statusFilter, 'DONE');
    assert.equal(state.deadlineFilter, 'ALL');

    // Clicking overdue while on DONE automatically clears DONE back to ALL
    state = applyFilterPatch(state, toggleQuickFilterPatch(state, 'overdue'));
    assert.equal(state.deadlineFilter, 'overdue');
    assert.equal(state.statusFilter, 'ALL');
  });

  it('buildActiveFilterChips generates readable removable chips and hides trash-irrelevant filters in trash mode', () => {
    const teams: Team[] = [
      {
        id: 10,
        name: 'Team Product',
        ownerId: 1,
        owner: { id: 1, name: 'An', email: 'an@test.com' },
        members: [
          {
            id: 101,
            teamId: 10,
            userId: 2,
            role: 'MEMBER',
            joinedAt: '',
            user: { id: 2, name: 'Binh', email: 'binh@test.com' },
          },
        ],
        createdAt: '',
        updatedAt: '',
      },
    ];
    const categories: Category[] = [
      { id: 7, name: 'Backend', color: '#1677ff', teamId: 10 },
    ];

    const filtered = applyFilterPatch(createDefaultTaskFilters(), {
      searchText: '  API  ',
      scopeFilter: 'my_work',
      teamFilter: 10,
      statusFilter: 'INCOMPLETE',
      priorityFilter: 'HIGH',
      categoryFilter: 7,
      assigneeFilter: 2,
      deadlineFilter: 'overdue',
      sortBy: 'due_date_asc',
    });

    const activeChips = buildActiveFilterChips(filtered, {
      isTrash: false,
      teams,
      categories,
      currentUserId: 1,
    });

    assert.deepEqual(
      activeChips.map((c) => ({ key: c.key, label: c.label })),
      [
        { key: 'search', label: 'Từ khóa: "API"' },
        { key: 'scope', label: 'Phạm vi: Công việc của tôi' },
        { key: 'team', label: 'Nhóm: Team Product' },
        { key: 'status', label: 'Trạng thái: Chưa hoàn thành' },
        { key: 'priority', label: 'Ưu tiên: Cao' },
        { key: 'category', label: 'Danh mục: Backend' },
        { key: 'assignee', label: 'Phụ trách: Binh' },
        { key: 'deadline', label: 'Hạn chót: Quá hạn' },
        { key: 'sortBy', label: 'Sắp xếp: Hạn gần nhất' },
      ],
    );

    // Removing a single chip clears only that filter
    const priorityChip = activeChips.find((c) => c.key === 'priority');
    assert.ok(priorityChip);
    const afterRemovePriority = applyFilterPatch(filtered, priorityChip.clearPatch);
    assert.equal(afterRemovePriority.priorityFilter, 'ALL');
    assert.equal(afterRemovePriority.deadlineFilter, 'overdue');

    // In trash mode, scope/status/deadline/sortBy chips are omitted
    const trashChips = buildActiveFilterChips(filtered, {
      isTrash: true,
      teams,
      categories,
      currentUserId: 1,
    });
    assert.deepEqual(
      trashChips.map((c) => c.key),
      ['search', 'team', 'priority', 'category', 'assignee'],
    );
  });
});
