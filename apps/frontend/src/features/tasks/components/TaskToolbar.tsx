import { useEffect, useRef, useMemo, useState, type ReactNode } from 'react';
import { Input, Select, Button, Space, Tag, Badge } from 'antd';
import {
  SearchOutlined,
  AppstoreOutlined,
  UserOutlined,
  CheckSquareOutlined,
  TeamOutlined,
  FilterOutlined,
  ReloadOutlined,
  SolutionOutlined,
  OrderedListOutlined,
  MailOutlined,
  DownOutlined,
  UpOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  CalendarOutlined,
  FireOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import type {
  TaskFilterState,
  TaskFilterPatch,
  TaskViewMode,
  TeamFilterValue,
  StatusFilter,
  PriorityFilter,
  DeadlineFilter,
  TaskSortBy,
  ScopeFilter,
} from '../types/task.types.ts';
import type { Category } from '../../categories/types/category.types.ts';
import type { Team } from '../../teams/types/team.types.ts';
import { useResponsive } from '../../../shared/hooks';
import {
  countActiveToolbarFilters,
  formatCountLabel,
  buildAssigneeOptions,
  filterCategoriesByTeamFilter,
} from '../utils/task-filter.utils.ts';
import {
  buildQuickFilterChips,
  toggleQuickFilterPatch,
  buildActiveFilterChips,
  type QuickFilterId,
  type ActiveFilterChip,
} from '../utils/quick-filters.utils.ts';
import './task-toolbar.css';

export interface TaskToolbarProps {
  filters: TaskFilterState;
  viewMode: TaskViewMode;
  categories: Category[];
  teams: Team[];
  currentUserId?: number;
  pendingInvitesCount?: number;
  onFiltersChange: (patch: TaskFilterPatch) => void;
  onReset: () => void;
}

function getQuickFilterIcon(id: QuickFilterId): ReactNode {
  switch (id) {
    case 'my_work':
      return <SolutionOutlined />;
    case 'today':
      return <ClockCircleOutlined />;
    case 'overdue':
      return <ExclamationCircleOutlined />;
    case 'due_soon':
      return <CalendarOutlined />;
    case 'high_priority':
      return <FireOutlined />;
    case 'incomplete':
      return <SyncOutlined />;
    case 'pending_invites':
      return <MailOutlined />;
  }
}

export default function TaskToolbar({
  filters,
  viewMode,
  categories = [],
  teams = [],
  currentUserId,
  pendingInvitesCount = 0,
  onFiltersChange,
  onReset,
}: TaskToolbarProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isMobile } = useResponsive();
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [prevSearchProp, setPrevSearchProp] = useState(filters.searchText);
  const [searchInput, setSearchInput] = useState(filters.searchText);

  if (filters.searchText !== prevSearchProp) {
    setPrevSearchProp(filters.searchText);
    setSearchInput(filters.searchText);
  }

  const isTrash = viewMode === 'trash';

  const activeSecondaryCount = useMemo(
    () => countActiveToolbarFilters(filters, isTrash),
    [filters, isTrash],
  );

  const quickFilterChips = useMemo(
    () => buildQuickFilterChips(filters, { isTrash, pendingInvitesCount }),
    [filters, isTrash, pendingInvitesCount],
  );

  const activeFilterChips = useMemo(
    () =>
      buildActiveFilterChips(filters, {
        isTrash,
        teams,
        categories,
        currentUserId,
      }),
    [filters, isTrash, teams, categories, currentUserId],
  );

  const toolbarCategories = useMemo(
    () => filterCategoriesByTeamFilter(categories ?? [], filters.teamFilter),
    [categories, filters.teamFilter],
  );

  const assigneeOptions = useMemo(() => {
    return buildAssigneeOptions(teams, filters.teamFilter, currentUserId);
  }, [teams, filters.teamFilter, currentUserId]);

  function handleInputChange(val: string) {
    setSearchInput(val);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onFiltersChange({ searchText: val });
    }, 300);
  }

  function handleImmediateSearch(val: string) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onFiltersChange({ searchText: val });
  }

  function handleResetClick() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSearchInput('');
    onReset();
  }

  function handleQuickFilterClick(id: QuickFilterId) {
    onFiltersChange(toggleQuickFilterPatch(filters, id));
  }

  function handleRemoveActiveChip(chip: ActiveFilterChip) {
    if (chip.key === 'search') {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setSearchInput('');
    }
    onFiltersChange(chip.clearPatch);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="task-toolbar-shell" data-testid="task-toolbar">
      {/* Row 1: Search, Compact Scope, Team & Advanced Filter Toggle */}
      <div className="task-toolbar-row-primary">
        <div className="task-toolbar-primary-inputs">
          <Input
            prefix={<SearchOutlined aria-hidden="true" style={{ color: '#bfbfbf' }} />}
            placeholder="Tìm kiếm công việc..."
            aria-label="Tìm kiếm công việc"
            value={searchInput}
            onChange={(e) => handleInputChange(e.target.value)}
            onPressEnter={() => handleImmediateSearch(searchInput)}
            allowClear
            style={{ width: isMobile ? '100%' : 240 }}
          />

          {!isTrash && (
            <Select<ScopeFilter>
              value={filters.scopeFilter}
              onChange={(sc) => onFiltersChange({ scopeFilter: sc })}
              aria-label="Lọc theo phạm vi công việc"
              style={{ width: isMobile ? '100%' : 195 }}
              options={[
                {
                  value: 'all',
                  label: (
                    <Space size={6}>
                      <AppstoreOutlined style={{ color: '#8c8c8c' }} />
                      <span>Tất cả công việc</span>
                    </Space>
                  ),
                },
                {
                  value: 'my_work',
                  label: (
                    <Space size={6}>
                      <SolutionOutlined style={{ color: '#1677ff' }} />
                      <span>Công việc của tôi</span>
                    </Space>
                  ),
                },
                {
                  value: 'assigned_to_me',
                  label: (
                    <Space size={6}>
                      <CheckSquareOutlined style={{ color: '#52c41a' }} />
                      <span>Tôi phụ trách</span>
                    </Space>
                  ),
                },
                {
                  value: 'collaborating',
                  label: (
                    <Space size={6}>
                      <TeamOutlined style={{ color: '#722ed1' }} />
                      <span>Tôi phối hợp</span>
                    </Space>
                  ),
                },
                {
                  value: 'subtasks_assigned_to_me',
                  label: (
                    <Space size={6}>
                      <OrderedListOutlined style={{ color: '#13c2c2' }} />
                      <span>Subtask của tôi</span>
                    </Space>
                  ),
                },
                {
                  value: 'created_by_me',
                  label: (
                    <Space size={6}>
                      <UserOutlined style={{ color: '#fa8c16' }} />
                      <span>Tôi đã tạo</span>
                    </Space>
                  ),
                },
                {
                  value: 'pending_invites',
                  label: (
                    <Space size={6}>
                      <MailOutlined style={{ color: '#fa541c' }} />
                      <span>{formatCountLabel('Lời mời chờ', pendingInvitesCount)}</span>
                    </Space>
                  ),
                },
              ]}
            />
          )}

          <Select<TeamFilterValue>
            value={filters.teamFilter}
            onChange={(tId) => onFiltersChange({ teamFilter: tId })}
            aria-label="Lọc phạm vi nhóm hoặc cá nhân"
            style={{ width: isMobile ? '100%' : 175 }}
            options={[
              {
                value: 'ALL',
                label: (
                  <Space size={6}>
                    <AppstoreOutlined style={{ color: '#8c8c8c' }} />
                    <span>Tất cả</span>
                  </Space>
                ),
              },
              {
                value: 'PERSONAL',
                label: (
                  <Space size={6}>
                    <UserOutlined style={{ color: '#fa8c16' }} />
                    <span>Cá nhân</span>
                  </Space>
                ),
              },
              ...teams.map((t) => ({
                value: t.id,
                label: (
                  <Space size={6}>
                    <TeamOutlined style={{ color: '#1677ff' }} />
                    <span>{t.name}</span>
                  </Space>
                ),
              })),
            ]}
          />
        </div>

        <div className="task-toolbar-primary-actions">
          <Button
            icon={<FilterOutlined aria-hidden="true" />}
            onClick={() => setFiltersExpanded((prev) => !prev)}
            aria-expanded={filtersExpanded}
            aria-controls="task-toolbar-advanced-row"
            data-testid="task-toolbar-advanced-toggle"
          >
            <Space size={6}>
              <span>Bộ lọc</span>
              {activeSecondaryCount > 0 && (
                <Badge count={activeSecondaryCount} size="small" />
              )}
              {filtersExpanded ? (
                <UpOutlined aria-hidden="true" style={{ fontSize: 10 }} />
              ) : (
                <DownOutlined aria-hidden="true" style={{ fontSize: 10 }} />
              )}
            </Space>
          </Button>
        </div>
      </div>

      {/* Row 2: Composable 1-Click Quick Filters Strip */}
      <div className="task-quick-filters-row" data-testid="task-quick-filters">
        <span className="task-quick-filters-label">
          <ThunderboltOutlined aria-hidden="true" style={{ color: '#faad14' }} />
          <span>Lọc nhanh:</span>
        </span>
        <div
          className="task-quick-filters-strip"
          role="group"
          aria-label="Bộ lọc nhanh công việc"
        >
          {quickFilterChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={chip.active}
              data-testid={`quick-filter-${chip.id}`}
              className={`task-quick-filter-chip tone-${chip.tone}${chip.active ? ' is-active' : ''}`}
              onClick={() => handleQuickFilterClick(chip.id)}
            >
              <span className="task-quick-filter-chip-icon" aria-hidden="true">
                {getQuickFilterIcon(chip.id)}
              </span>
              <span>{chip.label}</span>
              {chip.count !== undefined && (
                <span className="task-quick-filter-count">{chip.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Row 3a: Collapsible Secondary Filters (both desktop and mobile) */}
      {filtersExpanded && (
        <div
          id="task-toolbar-advanced-row"
          className="task-toolbar-secondary-row"
          data-testid="task-toolbar-advanced-row"
        >
          {/* Status Filter - Hidden in Trash */}
          {!isTrash && (
            <Select<StatusFilter>
              value={filters.statusFilter}
              onChange={(status) => onFiltersChange({ statusFilter: status })}
              size="small"
              aria-label="Lọc theo trạng thái"
              style={{ width: isMobile ? 'calc(50% - 5px)' : 168 }}
              options={[
                { value: 'ALL', label: 'Tất cả trạng thái' },
                {
                  value: 'INCOMPLETE',
                  label: (
                    <Tag color="geekblue" style={{ margin: 0 }}>
                      Chưa hoàn thành
                    </Tag>
                  ),
                },
                { value: 'TODO', label: <Tag color="orange" style={{ margin: 0 }}>Cần làm</Tag> },
                { value: 'IN_PROGRESS', label: <Tag color="blue" style={{ margin: 0 }}>Đang làm</Tag> },
                { value: 'DONE', label: <Tag color="green" style={{ margin: 0 }}>Hoàn thành</Tag> },
              ]}
            />
          )}

          {/* Priority Filter */}
          <Select<PriorityFilter>
            value={filters.priorityFilter}
            onChange={(priority) => onFiltersChange({ priorityFilter: priority })}
            size="small"
            aria-label="Lọc theo mức ưu tiên"
            style={{ width: isMobile ? 'calc(50% - 5px)' : 145 }}
            options={[
              { value: 'ALL', label: 'Tất cả ưu tiên' },
              { value: 'HIGH', label: <Tag color="red" style={{ margin: 0 }}>Ưu tiên cao</Tag> },
              { value: 'MEDIUM', label: <Tag color="gold" style={{ margin: 0 }}>Trung bình</Tag> },
              { value: 'LOW', label: <Tag color="cyan" style={{ margin: 0 }}>Ưu tiên thấp</Tag> },
            ]}
          />

          {/* Category Filter */}
          <Select<number | 'ALL'>
            value={filters.categoryFilter}
            onChange={(catId) => onFiltersChange({ categoryFilter: catId })}
            size="small"
            aria-label="Lọc theo danh mục"
            style={{ width: isMobile ? 'calc(50% - 5px)' : 165 }}
            options={[
              { value: 'ALL', label: 'Tất cả danh mục' },
              ...toolbarCategories.map((cat) => ({
                value: cat.id,
                label: (
                  <Space size={6} align="center">
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: cat.color,
                      }}
                    />
                    <span>
                      {cat.name}
                      {filters.teamFilter === 'ALL' && cat.team?.name ? ` (${cat.team.name})` : ''}
                    </span>
                  </Space>
                ),
              })),
            ]}
          />

          {/* Assignee Filter */}
          <Select<number | 'ALL'>
            value={filters.assigneeFilter}
            onChange={(aId) => onFiltersChange({ assigneeFilter: aId })}
            size="small"
            aria-label="Lọc theo người phụ trách"
            style={{ width: isMobile ? 'calc(50% - 5px)' : 180 }}
            options={assigneeOptions.map((opt) => ({
              value: opt.value,
              label: opt.label,
            }))}
          />

          {/* Deadline Filter - Hidden in Trash */}
          {!isTrash && (
            <Select<DeadlineFilter>
              value={filters.deadlineFilter}
              onChange={(dl) => onFiltersChange({ deadlineFilter: dl })}
              size="small"
              aria-label="Lọc theo hạn chót"
              style={{ width: isMobile ? 'calc(50% - 5px)' : 150 }}
              options={[
                { value: 'ALL', label: 'Mọi hạn chót' },
                { value: 'overdue', label: <Tag color="red" style={{ margin: 0 }}>Quá hạn</Tag> },
                { value: 'today', label: <Tag color="gold" style={{ margin: 0 }}>Hôm nay</Tag> },
                { value: 'due_soon', label: <Tag color="blue" style={{ margin: 0 }}>Sắp đến hạn</Tag> },
                { value: 'no_due_date', label: 'Chưa đặt hạn' },
              ]}
            />
          )}

          {/* SortBy Filter - Hidden in Trash */}
          {!isTrash && (
            <Select<TaskSortBy>
              value={filters.sortBy}
              onChange={(sb) => onFiltersChange({ sortBy: sb })}
              size="small"
              aria-label="Sắp xếp công việc"
              style={{ width: isMobile ? 'calc(50% - 5px)' : 165 }}
              options={[
                { value: 'default', label: 'Sắp xếp mặc định' },
                { value: 'due_date_asc', label: 'Hạn gần nhất' },
                { value: 'due_date_desc', label: 'Hạn xa nhất' },
                { value: 'priority_desc', label: 'Ưu tiên cao trước' },
              ]}
            />
          )}
        </div>
      )}

      {/* Row 3b: Active Filter Summary Chips (visible whenever any filter is active) */}
      {activeFilterChips.length > 0 && (
        <div className="task-active-filters-bar" data-testid="task-active-filters">
          <span className="task-active-filters-label">Đang lọc:</span>
          {activeFilterChips.map((chip) => (
            <span
              key={chip.key}
              className="task-active-filter-chip"
              data-testid={`active-filter-${chip.key}`}
            >
              <span className="task-active-filter-chip-text" title={chip.label}>
                {chip.label}
              </span>
              <button
                type="button"
                className="task-active-filter-chip-close"
                aria-label={`Bỏ lọc ${chip.label}`}
                onClick={() => handleRemoveActiveChip(chip)}
              >
                <CloseOutlined aria-hidden="true" />
              </button>
            </span>
          ))}

          <Button
            type="link"
            size="small"
            icon={<ReloadOutlined aria-hidden="true" />}
            onClick={handleResetClick}
            data-testid="task-toolbar-reset-all"
            style={{ padding: '0 4px', height: 24, fontSize: 12 }}
          >
            Xóa tất cả
          </Button>
        </div>
      )}
    </div>
  );
}
