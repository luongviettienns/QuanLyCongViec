import { useEffect, useRef, useMemo, useState } from 'react';
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
} from '@ant-design/icons';
import type {
  TaskFilterState,
  TaskFilterPatch,
  TaskViewMode,
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
  hasAnyToolbarFilter,
  formatCountLabel,
  shouldShowPendingInvitesShortcut,
  buildAssigneeOptions,
} from '../utils/task-filter.utils.ts';

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

  const hasAnyFilter = useMemo(
    () => hasAnyToolbarFilter(filters, isTrash),
    [filters, isTrash],
  );

  const showPendingShortcut = shouldShowPendingInvitesShortcut(
    isTrash,
    filters.scopeFilter,
    pendingInvitesCount,
  );

  const toolbarCategories = useMemo(() => {
    if (!categories) return [];
    if (filters.teamFilter !== 'ALL') {
      return categories.filter((c) => c.teamId === filters.teamFilter);
    }
    return categories;
  }, [categories, filters.teamFilter]);

  const assigneeOptions = useMemo(() => {
    return buildAssigneeOptions(teams, filters.teamFilter, currentUserId);
  }, [teams, filters.teamFilter, currentUserId]);

  function handleInputChange(val: string) {
    setSearchInput(val);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      onFiltersChange({ searchText: val });
    }, 300);
  }

  function handleImmediateSearch(val: string) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onFiltersChange({ searchText: val });
  }

  function handleResetClick() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setSearchInput('');
    onReset();
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div
      style={{
        background: '#ffffff',
        padding: '12px 16px',
        borderRadius: 8,
        border: '1px solid #f0f0f0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        marginBottom: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Row 1: Search, Compact Scope, Team, Pending Invites Shortcut, Filter Toggle & Reset */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="Tìm kiếm công việc..."
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

          {teams.length > 0 && (
            <Select<number | 'ALL'>
              value={filters.teamFilter}
              onChange={(tId) => onFiltersChange({ teamFilter: tId })}
              style={{ width: isMobile ? '100%' : 175 }}
              options={[
                {
                  value: 'ALL',
                  label: (
                    <Space size={6}>
                      <TeamOutlined style={{ color: '#8c8c8c' }} />
                      <span>Tất cả nhóm</span>
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
          )}

          {showPendingShortcut && (
            <Button
              size="small"
              type="dashed"
              icon={<MailOutlined />}
              onClick={() => onFiltersChange({ scopeFilter: 'pending_invites' })}
              style={{ color: '#d46b08', borderColor: '#ffd591', background: '#fff7e6' }}
            >
              {formatCountLabel('Lời mời chờ', pendingInvitesCount)}
            </Button>
          )}
        </div>

        <Space
          size={8}
          style={{
            width: isMobile ? '100%' : undefined,
            justifyContent: isMobile ? 'space-between' : 'flex-end',
          }}
        >
          <Button
            icon={<FilterOutlined />}
            onClick={() => setFiltersExpanded((prev) => !prev)}
          >
            <Space size={6}>
              <span>Bộ lọc</span>
              {activeSecondaryCount > 0 && (
                <Badge count={activeSecondaryCount} size="small" />
              )}
              {filtersExpanded ? (
                <UpOutlined style={{ fontSize: 10 }} />
              ) : (
                <DownOutlined style={{ fontSize: 10 }} />
              )}
            </Space>
          </Button>

          {hasAnyFilter && (
            <Button
              icon={<ReloadOutlined />}
              onClick={handleResetClick}
              type="primary"
              ghost
            >
              Đặt lại
            </Button>
          )}
        </Space>
      </div>

      {/* Row 2: Collapsible Secondary Filters (both desktop and mobile) */}
      {filtersExpanded && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            paddingTop: 10,
            borderTop: '1px solid #f5f5f5',
          }}
        >
          {/* Status Filter - Hidden in Trash */}
          {!isTrash && (
            <Select<StatusFilter>
              value={filters.statusFilter}
              onChange={(status) => onFiltersChange({ statusFilter: status })}
              size="small"
              style={{ width: isMobile ? 'calc(50% - 5px)' : 155 }}
              options={[
                { value: 'ALL', label: 'Tất cả trạng thái' },
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
    </div>
  );
}
