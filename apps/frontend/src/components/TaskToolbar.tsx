import { useEffect, useRef } from 'react';
import { Input, Select, Button } from 'antd';
import type { StatusFilter } from '../types/task.types';

interface TaskToolbarProps {
  searchText: string;
  statusFilter: StatusFilter;
  onSearchChange: (value: string) => void;
  onSearch: (value: string) => void;
  onStatusChange: (status: StatusFilter) => void;
  onReset: () => void;
}

export default function TaskToolbar({
  searchText,
  statusFilter,
  onSearchChange,
  onSearch,
  onStatusChange,
  onReset,
}: TaskToolbarProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        placeholder="Tìm kiếm theo tiêu đề hoặc mô tả..."
        value={searchText}
        onChange={(e) => handleInputChange(e.target.value)}
        onSearch={handleImmediateSearch}
        allowClear
        style={{ width: 320 }}
      />
      <Select<StatusFilter>
        value={statusFilter}
        onChange={handleStatusChange}
        style={{ width: 180 }}
        options={[
          { value: 'ALL', label: 'Tất cả trạng thái' },
          { value: 'TODO', label: 'Cần làm (TODO)' },
          { value: 'IN_PROGRESS', label: 'Đang làm (IN_PROGRESS)' },
          { value: 'DONE', label: 'Hoàn thành (DONE)' },
        ]}
      />
      <Button onClick={handleResetClick}>
        Đặt lại
      </Button>
    </div>
  );
}
