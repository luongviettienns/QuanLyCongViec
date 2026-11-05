import { useEffect, useRef } from 'react';
import { Input, Select, Button, Space, Grid } from 'antd';
import type { StatusFilter, PriorityFilter, Category, Team } from '../types/task.types';

interface TaskToolbarProps {
  searchText: string;
  statusFilter: StatusFilter;
  categoryFilter?: number | 'ALL';
  priorityFilter?: PriorityFilter;
  teamFilter?: number | 'ALL';
  scopeFilter?: 'all' | 'created_by_me' | 'assigned_to_me';
  categories?: Category[];
  teams?: Team[];
  onSearchChange: (value: string) => void;
  onSearch: (value: string) => void;
  onStatusChange: (status: StatusFilter) => void;
  onCategoryChange?: (categoryId: number | 'ALL') => void;
  onPriorityChange?: (priority: PriorityFilter) => void;
  onTeamChange?: (teamId: number | 'ALL') => void;
  onScopeChange?: (scope: 'all' | 'created_by_me' | 'assigned_to_me') => void;
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
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.sm;

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
  }

  function handleScopeChange(sc: 'all' | 'created_by_me' | 'assigned_to_me') {
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
        display: 'flex',
        gap: 12,
        marginBottom: 20,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <Input.Search
        placeholder="Tìm kiếm theo tiêu đề..."
        value={searchText}
        onChange={(e) => handleInputChange(e.target.value)}
        onSearch={handleImmediateSearch}
        allowClear
        style={{ width: isMobile ? '100%' : 240 }}
      />
      <Select<'all' | 'created_by_me' | 'assigned_to_me'>
        value={scopeFilter}
        onChange={handleScopeChange}
        style={{
          flex: isMobile ? '1 1 calc(50% - 6px)' : undefined,
          width: isMobile ? undefined : 160,
          minWidth: isMobile ? 140 : undefined,
        }}
        options={[
          { value: 'all', label: 'Tất cả phạm vi' },
          { value: 'created_by_me', label: 'Tôi đã tạo' },
          { value: 'assigned_to_me', label: 'Được giao cho tôi' },
        ]}
      />
      {teams.length > 0 && (
        <Select<number | 'ALL'>
          value={teamFilter}
          onChange={handleTeamChange}
          style={{
            flex: isMobile ? '1 1 calc(50% - 6px)' : undefined,
            width: isMobile ? undefined : 160,
            minWidth: isMobile ? 140 : undefined,
          }}
          options={[
            { value: 'ALL', label: 'Tất cả nhóm' },
            ...teams.map((t) => ({
              value: t.id,
              label: t.name,
            })),
          ]}
        />
      )}
      <Select<StatusFilter>
        value={statusFilter}
        onChange={handleStatusChange}
        style={{
          flex: isMobile ? '1 1 calc(50% - 6px)' : undefined,
          width: isMobile ? undefined : 150,
          minWidth: isMobile ? 140 : undefined,
        }}
        options={[
          { value: 'ALL', label: 'Tất cả trạng thái' },
          { value: 'TODO', label: 'Cần làm (TODO)' },
          { value: 'IN_PROGRESS', label: 'Đang làm (IN_PROGRESS)' },
          { value: 'DONE', label: 'Hoàn thành (DONE)' },
        ]}
      />
      <Select<PriorityFilter>
        value={priorityFilter}
        onChange={handlePriorityChange}
        style={{
          flex: isMobile ? '1 1 calc(50% - 6px)' : undefined,
          width: isMobile ? undefined : 150,
          minWidth: isMobile ? 140 : undefined,
        }}
        options={[
          { value: 'ALL', label: 'Tất cả độ ưu tiên' },
          { value: 'HIGH', label: 'Cao (HIGH)' },
          { value: 'MEDIUM', label: 'Trung bình (MEDIUM)' },
          { value: 'LOW', label: 'Thấp (LOW)' },
        ]}
      />
      <Select<number | 'ALL'>
        value={categoryFilter}
        onChange={handleCategoryChange}
        style={{
          flex: isMobile ? '1 1 calc(50% - 6px)' : undefined,
          width: isMobile ? undefined : 160,
          minWidth: isMobile ? 140 : undefined,
        }}
        options={[
          { value: 'ALL', label: 'Tất cả danh mục' },
          ...categories.map((cat) => ({
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
                <span>{cat.name}</span>
              </Space>
            ),
          })),
        ]}
      />
      <Button
        onClick={handleResetClick}
        style={{
          width: isMobile ? '100%' : undefined,
        }}
      >
        Đặt lại
      </Button>
    </div>
  );
}
