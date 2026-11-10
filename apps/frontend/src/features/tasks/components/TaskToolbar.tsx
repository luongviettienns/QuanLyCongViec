import { useEffect, useRef, useMemo } from 'react';
import { Input, Select, Button, Space, Segmented, Tag } from 'antd';
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
} from '@ant-design/icons';
import type { StatusFilter, PriorityFilter, ScopeFilter } from '../types/task.types';
import type { Category } from '../../categories/types/category.types';
import type { Team } from '../../teams/types/team.types';
import { useResponsive } from '../../../shared/hooks';

interface TaskToolbarProps {
  searchText: string;
  statusFilter: StatusFilter;
  categoryFilter?: number | 'ALL';
  priorityFilter?: PriorityFilter;
  teamFilter?: number | 'ALL';
  scopeFilter?: ScopeFilter;
  categories?: Category[];
  teams?: Team[];
  onSearchChange: (value: string) => void;
  onSearch: (value: string) => void;
  onStatusChange: (status: StatusFilter) => void;
  onCategoryChange?: (categoryId: number | 'ALL') => void;
  onPriorityChange?: (priority: PriorityFilter) => void;
  onTeamChange?: (teamId: number | 'ALL') => void;
  onScopeChange?: (scope: ScopeFilter) => void;
  onReset: () => void;
}

export default function TaskToolbar({
  searchText,
  statusFilter,
  categoryFilter = 'ALL',
  priorityFilter = 'ALL',
  teamFilter = 'ALL',
  scopeFilter = 'all',
  categories = [],
  teams = [],
  onSearchChange,
  onSearch,
  onStatusChange,
  onCategoryChange,
  onPriorityChange,
  onTeamChange,
  onScopeChange,
  onReset,
}: TaskToolbarProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isMobile } = useResponsive();

  const activeFilterCount =
    (searchText.trim() ? 1 : 0) +
    (scopeFilter !== 'all' ? 1 : 0) +
    (teamFilter !== 'ALL' ? 1 : 0) +
    (statusFilter !== 'ALL' ? 1 : 0) +
    (priorityFilter !== 'ALL' ? 1 : 0) +
    (categoryFilter !== 'ALL' ? 1 : 0);

  const toolbarCategories = useMemo(() => {
    if (!categories) return [];
    if (teamFilter !== 'ALL') {
      return categories.filter((c) => c.teamId === teamFilter);
    }
    return categories;
  }, [categories, teamFilter]);

  function handleInputChange(val: string) {
    onSearchChange(val);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      onSearch(val);
    }, 300);
  }

  function handleImmediateSearch(val: string) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onSearch(val);
  }

  function handleStatusChange(status: StatusFilter) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onStatusChange(status);
  }

  function handleCategoryChange(catId: number | 'ALL') {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onCategoryChange?.(catId);
  }

  function handlePriorityChange(priority: PriorityFilter) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onPriorityChange?.(priority);
  }

  function handleTeamChange(tId: number | 'ALL') {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onTeamChange?.(tId);
    if (categoryFilter !== 'ALL') {
      onCategoryChange?.('ALL');
    }
  }

  function handleScopeChange(sc: ScopeFilter) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onScopeChange?.(sc);
  }

  function handleResetClick() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
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
            value={searchText}
            onChange={(e) => handleInputChange(e.target.value)}
            onPressEnter={() => handleImmediateSearch(searchText)}
            allowClear
            style={{ width: isMobile ? '100%' : 260 }}
          />

          <Segmented<ScopeFilter>
            value={scopeFilter}
            onChange={handleScopeChange}
            style={{ overflowX: 'auto', maxWidth: '100%' }}
            options={[
              { value: 'all', label: 'Tất cả công việc', icon: <AppstoreOutlined /> },
              { value: 'my_work', label: 'Công việc của tôi', icon: <SolutionOutlined /> },
              { value: 'assigned_to_me', label: 'Tôi phụ trách', icon: <CheckSquareOutlined /> },
              { value: 'collaborating', label: 'Tôi phối hợp', icon: <TeamOutlined /> },
              { value: 'subtasks_assigned_to_me', label: 'Subtask của tôi', icon: <OrderedListOutlined /> },
              { value: 'created_by_me', label: 'Tôi đã tạo', icon: <UserOutlined /> },
            ]}
          />
        </div>

        {teams.length > 0 && (
          <Select<number | 'ALL'>
            value={teamFilter}
            onChange={handleTeamChange}
            style={{ width: isMobile ? '100%' : 180 }}
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
      </div>

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

          <Select<StatusFilter>
            value={statusFilter}
            onChange={handleStatusChange}
            size="small"
            style={{ width: isMobile ? 'calc(50% - 5px)' : 155 }}
            options={[
              { value: 'ALL', label: 'Tất cả trạng thái' },
              { value: 'TODO', label: <Tag color="orange" style={{ margin: 0 }}>Cần làm</Tag> },
              { value: 'IN_PROGRESS', label: <Tag color="blue" style={{ margin: 0 }}>Đang làm</Tag> },
              { value: 'DONE', label: <Tag color="green" style={{ margin: 0 }}>Hoàn thành</Tag> },
            ]}
          />

          <Select<PriorityFilter>
            value={priorityFilter}
            onChange={handlePriorityChange}
            size="small"
            style={{ width: isMobile ? 'calc(50% - 5px)' : 145 }}
            options={[
              { value: 'ALL', label: 'Tất cả ưu tiên' },
              { value: 'HIGH', label: <Tag color="red" style={{ margin: 0 }}>Ưu tiên cao</Tag> },
              { value: 'MEDIUM', label: <Tag color="gold" style={{ margin: 0 }}>Trung bình</Tag> },
              { value: 'LOW', label: <Tag color="cyan" style={{ margin: 0 }}>Ưu tiên thấp</Tag> },
            ]}
          />

          <Select<number | 'ALL'>
            value={categoryFilter}
            onChange={handleCategoryChange}
            size="small"
            style={{ width: isMobile ? '100%' : 165 }}
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
                      {teamFilter === 'ALL' && cat.team?.name ? ` (${cat.team.name})` : ''}
                    </span>
                  </Space>
                ),
              })),
            ]}
          />
        </div>

        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={handleResetClick}
          disabled={activeFilterCount === 0}
          type={activeFilterCount > 0 ? 'primary' : 'default'}
          ghost={activeFilterCount > 0}
          style={{ width: isMobile ? '100%' : undefined }}
        >
          {activeFilterCount > 0 ? `Đặt lại (${activeFilterCount})` : 'Đặt lại'}
        </Button>
      </div>
    </div>
  );
}
