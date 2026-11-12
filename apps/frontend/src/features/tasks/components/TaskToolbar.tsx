import { useEffect, useRef, useMemo, useState } from 'react';
import { Input, Select, Button, Space, Segmented, Tag, Badge } from 'antd';
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
  countActiveFilters,
  buildAssigneeOptions,
} from '../utils/task-filter.utils.ts';

export interface TaskToolbarProps {
  filters: TaskFilterState;
  viewMode: TaskViewMode;
  categories: Category[];
  teams: Team[];
  currentUserId?: number;
  onFiltersChange: (patch: TaskFilterPatch) => void;
  onReset: () => void;
}

export default function TaskToolbar({
  filters,
  viewMode,
  categories = [],
  teams = [],
  currentUserId,
  onFiltersChange,
  onReset,
}: TaskToolbarProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isMobile } = useResponsive();
  const [mobileFiltersExpanded, setMobileFiltersExpanded] = useState(false);
  const [prevSearchProp, setPrevSearchProp] = useState(filters.searchText);
  const [searchInput, setSearchInput] = useState(filters.searchText);

  if (filters.searchText !== prevSearchProp) {
    setPrevSearchProp(filters.searchText);
    setSearchInput(filters.searchText);
  }

  const isTrash = viewMode === 'trash';

  const activeSecondaryCount = useMemo(() => {
    if (isTrash) {
      let count = 0;
      if (filters.categoryFilter !== 'ALL') count += 1;
      if (filters.priorityFilter !== 'ALL') count += 1;
      if (filters.assigneeFilter !== 'ALL') count += 1;
      return count;
    }
    return countActiveFilters(filters);
  }, [filters, isTrash]);

  const hasAnyFilter = useMemo(() => {
    return (
      filters.searchText.trim().length > 0 ||
      filters.teamFilter !== 'ALL' ||
      (!isTrash && filters.scopeFilter !== 'all') ||
      activeSecondaryCount > 0
    );
  }, [filters, isTrash, activeSecondaryCount]);

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
        padding: '14px 16px',
        borderRadius: 8,
        border: '1px solid #f0f0f0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        marginBottom: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Row 1: Search, Scope (if not trash), Team, and Mobile Filter Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="Tìm kiếm công việc..."
            value={searchInput}
            onChange={(e) => handleInputChange(e.target.value)}
            onPressEnter={() => handleImmediateSearch(searchInput)}
            allowClear
            style={{ width: isMobile ? '100%' : 260 }}
          />

          {!isTrash && (
            <Segmented<ScopeFilter>
              value={filters.scopeFilter}
              onChange={(sc) => onFiltersChange({ scopeFilter: sc })}
              style={{ overflowX: 'auto', maxWidth: '100%' }}
              options={[
                { value: 'all', label: 'Tất cả công việc', icon: <AppstoreOutlined /> },
                { value: 'my_work', label: 'Công việc của tôi', icon: <SolutionOutlined /> },
                { value: 'assigned_to_me', label: 'Tôi phụ trách', icon: <CheckSquareOutlined /> },
                { value: 'collaborating', label: 'Tôi phối hợp', icon: <TeamOutlined /> },
                {
                  value: 'subtasks_assigned_to_me',
                  label: 'Subtask của tôi',
                  icon: <OrderedListOutlined />,
                },
                { value: 'created_by_me', label: 'Tôi đã tạo', icon: <UserOutlined /> },
                { value: 'pending_invites', label: 'Lời mời chờ', icon: <MailOutlined /> },
              ]}
            />
          )}
        </div>

        <Space size={10} style={{ width: isMobile ? '100%' : undefined, justifyContent: 'flex-end' }}>
          {teams.length > 0 && (
            <Select<number | 'ALL'>
              value={filters.teamFilter}
              onChange={(tId) => onFiltersChange({ teamFilter: tId })}
              style={{ width: isMobile ? 'calc(100% - 110px)' : 180 }}
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

          {isMobile && (
            <Button
              icon={<FilterOutlined />}
              onClick={() => setMobileFiltersExpanded((prev) => !prev)}
            >
              <Space size={4}>
                <span>Bộ lọc</span>
                {activeSecondaryCount > 0 && (
                  <Badge count={activeSecondaryCount} size="small" />
                )}
                {mobileFiltersExpanded ? <UpOutlined style={{ fontSize: 10 }} /> : <DownOutlined style={{ fontSize: 10 }} />}
              </Space>
            </Button>
          )}
        </Space>
      </div>

      {/* Row 2: Collapsible Secondary Filters (always shown on desktop, toggleable on mobile) */}
      {(!isMobile || mobileFiltersExpanded) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            paddingTop: 8,
            borderTop: '1px solid #f5f5f5',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Space size={6} style={{ color: '#8c8c8c', fontSize: 13, marginRight: 4 }}>
              <FilterOutlined />
              <span>Bộ lọc:</span>
            </Space>

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

          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={handleResetClick}
            disabled={!hasAnyFilter}
            type={hasAnyFilter ? 'primary' : 'default'}
            ghost={hasAnyFilter}
            style={{ width: isMobile ? '100%' : undefined }}
          >
            {activeSecondaryCount > 0 ? `Đặt lại (${activeSecondaryCount})` : 'Đặt lại'}
          </Button>
        </div>
      )}
    </div>
  );
}
