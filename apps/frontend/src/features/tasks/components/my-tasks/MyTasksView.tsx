import React, { useState } from 'react';
import { Button, Empty, Input, Pagination, Segmented, Select, Spin } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { Task } from '../../types/task.types';
import type { Team } from '../../../teams/types/team.types';
import type { User } from '../../../auth/types/auth.types';
import { ApiErrorFallback } from '../../../../app/pages/errors';
import { resolveErrorFallbackVariant } from '../../utils/task-error.utils';
import {
  type MyTaskRoleFilter,
  type MyTasksNavigationPreset,
  type MyTaskSortKey,
  type MyTaskStatusTab,
} from '../../utils/my-tasks.utils';
import { useMyTasks } from '../../hooks/useMyTasks';
import { useResponsive } from '../../../../shared/hooks';
import { MyTasksStatCards } from './MyTasksStatCards';
import { MyTasksQuickAdd } from './MyTasksQuickAdd';
import { MyTasksRow } from './MyTasksRow';
import { MyTaskDetailPanel } from './MyTaskDetailPanel';
import './my-tasks.css';

export interface MyTasksViewProps {
  teams: Team[];
  currentUser: User | null;
  initialPreset?: MyTasksNavigationPreset | null;
  presetKey?: number;
  refreshKey?: number;
  onPresetConsumed?: () => void;
  onOpenFullModal: (task: Task) => void;
  onCreateTask?: () => void;
  onExternalSync?: () => void;
}

export const MyTasksView: React.FC<MyTasksViewProps> = ({
  teams,
  currentUser,
  initialPreset = null,
  presetKey = 0,
  refreshKey = 0,
  onPresetConsumed,
  onOpenFullModal,
  onCreateTask,
  onExternalSync,
}) => {
  const { isMobile } = useResponsive();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const {
    allMyTasks,
    visibleTasks,
    stats,
    loading,
    error,
    creatingQuick,
    filterState,
    hasActiveFilters,
    selectedTask,
    selectedTaskId,
    detailFocusSection,
    detailFocusVersion,
    setSearchText,
    setRoleFilter,
    setSortBy,
    selectStatusTab,
    toggleDeadlineCard,
    resetFilters,
    selectTask,
    refresh,
    quickCreateTask,
    updateTaskStatusQuick,
    updateTaskFieldQuick,
    returnTaskQuick,
    syncTaskSubtasks,
  } = useMyTasks({
    enabled: Boolean(currentUser),
    user: currentUser,
    teams,
    initialPreset,
    presetKey,
    refreshKey,
    onPresetConsumed,
    onExternalSync,
  });

  const totalPages = Math.max(1, Math.ceil(visibleTasks.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedTasks = visibleTasks.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const fallbackVariant = resolveErrorFallbackVariant(error, allMyTasks.length);

  if (fallbackVariant === 'page') {
    return (
      <ApiErrorFallback
        variant="page"
        error={error}
        onRetry={() => void refresh()}
        retrying={loading}
        showNavigation
      />
    );
  }

  return (
    <div className="my-tasks-root">
      {fallbackVariant === 'inline' && (
        <ApiErrorFallback
          variant="inline"
          error={error}
          onRetry={() => void refresh()}
          retrying={loading}
          showNavigation={false}
        />
      )}

      {/* 3 Compact Deadline Stat Cards */}
      <MyTasksStatCards
        stats={stats}
        activeCard={filterState.deadlineCard}
        onToggleCard={(card) => {
          setCurrentPage(1);
          toggleDeadlineCard(card);
        }}
      />

      {/* Status Group Tabs + Compact Inline Controls */}
      <div className="my-tasks-controls-bar">
        <div className="my-tasks-segmented-wrap">
          <Segmented<MyTaskStatusTab>
            size="middle"
            value={filterState.statusTab}
            onChange={(tab) => {
              setCurrentPage(1);
              selectStatusTab(tab);
            }}
            options={[
              { value: 'ALL', label: `Tất cả (${stats.all})` },
              { value: 'TODO', label: `Cần xử lý (${stats.todo})` },
              { value: 'IN_PROGRESS', label: `Đang thực hiện (${stats.inProgress})` },
              { value: 'DONE', label: `Hoàn thành (${stats.done})` },
            ]}
          />
        </div>

        <div className="my-tasks-controls-filters" style={{ width: isMobile ? '100%' : undefined }}>
          <Input
            size="middle"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="Tìm trong việc của tôi..."
            value={filterState.searchText}
            onChange={(e) => {
              setCurrentPage(1);
              setSearchText(e.target.value);
            }}
            allowClear
            style={{ width: isMobile ? '100%' : 210 }}
          />

          <Select<MyTaskRoleFilter>
            size="middle"
            value={filterState.roleFilter}
            onChange={(role) => {
              setCurrentPage(1);
              setRoleFilter(role);
            }}
            style={{ width: isMobile ? 'calc(50% - 4px)' : 155 }}
            aria-label="Lọc theo vai trò trong công việc"
            options={[
              { value: 'all', label: 'Tất cả vai trò' },
              { value: 'assignee', label: 'Tôi phụ trách' },
              { value: 'personal', label: 'Việc cá nhân' },
              { value: 'collaborator', label: 'Tôi phối hợp' },
              { value: 'has_my_subtasks', label: 'Có việc con' },
            ]}
          />

          <Select<MyTaskSortKey>
            size="middle"
            value={filterState.sortBy}
            onChange={(sort) => {
              setCurrentPage(1);
              setSortBy(sort);
            }}
            style={{ width: isMobile ? 'calc(50% - 4px)' : 165 }}
            aria-label="Sắp xếp công việc của tôi"
            options={[
              { value: 'smart_deadline', label: 'Ưu tiên theo hạn' },
              { value: 'due_date_asc', label: 'Hạn gần nhất' },
              { value: 'priority_desc', label: 'Ưu tiên cao nhất' },
              { value: 'updated_desc', label: 'Cập nhật gần nhất' },
            ]}
          />

          {hasActiveFilters && (
            <Button
              size="middle"
              icon={<ReloadOutlined />}
              onClick={() => {
                setCurrentPage(1);
                resetFilters();
              }}
            >
              Xóa lọc
            </Button>
          )}
        </div>
      </div>

      {/* Main Split Workspace: List + Right Task Detail */}
      <div className="my-tasks-workspace">
        <div className="my-tasks-list-column">
          <div className="my-tasks-list-card">
            <MyTasksQuickAdd
              loading={creatingQuick}
              onQuickCreate={quickCreateTask}
            />

            {loading && allMyTasks.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <Spin description="Đang tải việc của tôi..." />
              </div>
            ) : visibleTasks.length === 0 ? (
              <div style={{ padding: '44px 16px' }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    hasActiveFilters
                      ? 'Không có công việc nào khớp bộ lọc hiện tại'
                      : 'Bạn chưa có công việc nào cần xử lý'
                  }
                >
                  {hasActiveFilters ? (
                    <Button size="small" onClick={resetFilters}>
                      Xóa bộ lọc
                    </Button>
                  ) : (
                    onCreateTask && (
                      <Button
                        size="small"
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={onCreateTask}
                      >
                        Tạo công việc đầu tiên
                      </Button>
                    )
                  )}
                </Empty>
              </div>
            ) : (
              <>
                <div>
                  {paginatedTasks.map((task) => (
                    <MyTasksRow
                      key={task.id}
                      task={task}
                      teams={teams}
                      currentUser={currentUser}
                      selected={selectedTaskId === task.id}
                      onSelect={selectTask}
                      onUpdateStatus={updateTaskStatusQuick}
                    />
                  ))}
                </div>

                <div className="my-tasks-pagination">
                  <Pagination
                    current={safePage}
                    pageSize={pageSize}
                    total={visibleTasks.length}
                    showSizeChanger
                    pageSizeOptions={['10', '20', '50']}
                    size={isMobile ? 'small' : undefined}
                    showTotal={(total, range) => `${range[0]}-${range[1]} / ${total} công việc`}
                    onChange={(page, nextSize) => {
                      if (nextSize !== pageSize) {
                        setPageSize(nextSize);
                        setCurrentPage(1);
                      } else {
                        setCurrentPage(page);
                      }
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <MyTaskDetailPanel
          task={selectedTask}
          teams={teams}
          currentUser={currentUser}
          focusSection={detailFocusSection}
          focusVersion={detailFocusVersion}
          onClose={() => selectTask(null)}
          onOpenFullModal={onOpenFullModal}
          onUpdateStatus={updateTaskStatusQuick}
          onUpdateField={updateTaskFieldQuick}
          onReturnTask={returnTaskQuick}
          onSubtasksChange={syncTaskSubtasks}
        />
      </div>
    </div>
  );
};
