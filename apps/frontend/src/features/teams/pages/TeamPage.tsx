import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Row,
  Col,
  Card,
  Button,
  Form,
  message,
  Empty,
  Spin,
  Tabs,
  Input,
  Tag,
  Grid,
  Modal,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  UnorderedListOutlined,
  UserOutlined,
  HistoryOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import {
  getTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
  transferOwnership,
} from '../api/teams.api';
import {
  getTasks,
  updateTaskStatus,
  updateTaskAssignee,
  updateTaskContent,
  returnTask,
  deleteTask,
} from '../../tasks/api/tasks.api';
import { getCategories } from '../../categories/api/categories.api';
import {
  ApiError,
  isAbortError,
  isUnauthorizedError,
  isForbiddenError,
  isNotFoundError,
  getFriendlyErrorMessage,
} from '../../../shared/api';
import { ApiErrorFallback } from '../../../app/pages/errors';
import { useAuth } from '../../auth/hooks/useAuth';
import type {
  Team,
  TeamRole,
  CreateTeamPayload,
  UpdateTeamPayload,
  AddMemberPayload,
} from '../types/team.types';
import type { Subtask, Task, TaskModalTab, TaskPriority, TaskStatus } from '../../tasks/types/task.types';
import type { Category } from '../../categories/types/category.types';
import { TeamModals } from '../components/TeamModals';
import { TeamCategorySection } from '../components/TeamCategorySection';
import { TeamActivitySection } from '../components/TeamActivitySection';
import TaskFormModal from '../../tasks/components/TaskFormModal';
import { useRealtimeEvent, useRealtimeReconnect } from '../../realtime';
import type { RealtimeEventData } from '../../realtime/types/realtime.types';
import {
  shouldRefreshTeamPageOnEvent,
  createDebouncedCallback,
} from '../utils/team-realtime.utils';
import {
  computeTeamCommandMetrics,
  filterTeamTasks,
  type CommandFilterType,
  type TeamCommandMetrics,
} from '../utils/team-command-center.utils';
import { buildTeamMemberOptions } from '../utils/team-quick-assign.utils';
import {
  TeamCommandHeader,
  TeamStatStrip,
  TeamTaskTable,
  TeamCommandPanel,
  TeamMembersTab,
  TeamQuickAssignDrawer,
} from '../components/command-center';

const { useBreakpoint } = Grid;

interface TeamPageProps {
  onTeamChanged?: () => void;
  refreshTrigger?: number;
}

function getFilterLabel(filter: CommandFilterType): string {
  switch (filter) {
    case 'in_progress':
      return 'Đang làm';
    case 'overdue':
      return 'Quá hạn';
    case 'done':
      return 'Hoàn thành';
    case 'unassigned':
      return 'Chưa phân công';
    case 'due_soon':
      return 'Sắp đến hạn';
    default:
      return 'Tất cả';
  }
}

export default function TeamPage({ onTeamChanged, refreshTrigger }: TeamPageProps) {
  const { user } = useAuth();
  const { teamId: routeTeamId } = useParams<{ teamId?: string }>();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobileOrTablet = !screens.lg;

  // Teams state
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamsError, setTeamsError] = useState<unknown>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<unknown>(null);

  // Team tasks & categories state
  const [teamTasks, setTeamTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [teamCategories, setTeamCategories] = useState<Category[]>([]);
  const [teamCategoryModalOpen, setTeamCategoryModalOpen] = useState(false);

  // Navigation & filter state
  const [activeTab, setActiveTab] = useState<'tasks' | 'members' | 'activity'>('tasks');
  const [commandFilter, setCommandFilter] = useState<CommandFilterType>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Right Panel & Modal state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickAssignOpen, setQuickAssignOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalTask, setTaskModalTask] = useState<Task | null>(null);
  const [taskModalTab, setTaskModalTab] = useState<TaskModalTab>('info');

  // Team Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const [createForm] = Form.useForm<CreateTeamPayload>();
  const [editForm] = Form.useForm<UpdateTeamPayload>();
  const [addMemberForm] = Form.useForm<AddMemberPayload>();

  // Refs for tracking active async controllers
  const teamsAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const tasksAbortRef = useRef<AbortController | null>(null);
  const categoriesAbortRef = useRef<AbortController | null>(null);

  const selectedTeamRef = useRef<Team | null>(null);
  useEffect(() => {
    selectedTeamRef.current = selectedTeam;
  }, [selectedTeam]);

  const selectedTeamIdRef = useRef<number | null>(null);
  useEffect(() => {
    selectedTeamIdRef.current = selectedTeamId;
  }, [selectedTeamId]);

  const selectedTaskRef = useRef<Task | null>(null);
  useEffect(() => {
    selectedTaskRef.current = selectedTask;
  }, [selectedTask]);

  const routeTeamIdRef = useRef<string | undefined>(routeTeamId);
  useEffect(() => {
    routeTeamIdRef.current = routeTeamId;
  }, [routeTeamId]);

  // Adjust selectedTeamId during render when routeTeamId changes
  const [prevRouteTeamId, setPrevRouteTeamId] = useState(routeTeamId);
  if (routeTeamId !== prevRouteTeamId) {
    setPrevRouteTeamId(routeTeamId);
    if (routeTeamId) {
      const parsed = Number(routeTeamId);
      if (!isNaN(parsed) && teams.some((t) => t.id === parsed)) {
        setSelectedTeamId(parsed);
      }
    }
  }

  // Load Teams list
  const loadTeams = useCallback(async (selectId?: number): Promise<Team[]> => {
    teamsAbortRef.current?.abort();
    const controller = new AbortController();
    teamsAbortRef.current = controller;
    setLoading(true);
    try {
      const data = await getTeams(controller.signal);
      if (controller.signal.aborted || teamsAbortRef.current !== controller) {
        return [];
      }
      setTeams(data);
      setTeamsError(null);
      if (data.length > 0) {
        const parsedRouteId = routeTeamIdRef.current ? Number(routeTeamIdRef.current) : null;
        const validRouteId = parsedRouteId && !isNaN(parsedRouteId) ? parsedRouteId : null;
        const targetId = selectId ?? validRouteId;
        const nextId = targetId && data.some((t) => t.id === targetId) ? targetId : data[0].id;
        setSelectedTeamId(nextId);
      } else {
        setSelectedTeamId(null);
        setSelectedTeam(null);
        setDetailError(null);
        setTeamTasks([]);
      }
      return data;
    } catch (err: unknown) {
      if (controller.signal.aborted || isAbortError(err) || isUnauthorizedError(err)) {
        return [];
      }
      if (teamsAbortRef.current === controller) {
        setTeamsError(err);
      }
      return [];
    } finally {
      if (!controller.signal.aborted && teamsAbortRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  // Load Team Detail
  const loadTeamDetail = useCallback(async (id: number) => {
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    if (selectedTeamRef.current && selectedTeamRef.current.id !== id) {
      setSelectedTeam(null);
      setDetailError(null);
    }
    setDetailLoading(true);
    try {
      const data = await getTeamById(id, controller.signal);
      if (controller.signal.aborted || detailAbortRef.current !== controller) {
        return;
      }
      setSelectedTeam(data);
      setDetailError(null);
    } catch (err: unknown) {
      if (controller.signal.aborted || isAbortError(err) || isUnauthorizedError(err)) {
        return;
      }
      if (detailAbortRef.current === controller) {
        if (isForbiddenError(err) || isNotFoundError(err)) {
          setSelectedTeam(null);
        }
        setDetailError(err);
      }
    } finally {
      if (!controller.signal.aborted && detailAbortRef.current === controller) {
        setDetailLoading(false);
      }
    }
  }, []);

  // Load Team Tasks
  const loadTeamTasks = useCallback(async (teamId: number) => {
    tasksAbortRef.current?.abort();
    const controller = new AbortController();
    tasksAbortRef.current = controller;
    setTasksLoading(true);
    try {
      const data = await getTasks({ teamId }, controller.signal);
      if (controller.signal.aborted || tasksAbortRef.current !== controller) {
        return;
      }
      setTeamTasks(data);
      // Synchronize selectedTask if open
      if (selectedTaskRef.current) {
        const refreshed = data.find((t) => t.id === selectedTaskRef.current?.id);
        setSelectedTask(refreshed ?? null);
      }
    } catch (err: unknown) {
      if (controller.signal.aborted || isAbortError(err) || isUnauthorizedError(err)) {
        return;
      }
    } finally {
      if (!controller.signal.aborted && tasksAbortRef.current === controller) {
        setTasksLoading(false);
      }
    }
  }, []);

  // Load Team Categories
  const loadTeamCategories = useCallback(async (teamId: number) => {
    categoriesAbortRef.current?.abort();
    const controller = new AbortController();
    categoriesAbortRef.current = controller;
    try {
      const data = await getCategories({ teamId }, controller.signal);
      if (!controller.signal.aborted && categoriesAbortRef.current === controller) {
        setTeamCategories(data);
      }
    } catch {
      // silent fallback for category dropdown options
    }
  }, []);

  // Initial load
  useEffect(() => {
    let active = true;
    async function init() {
      await Promise.resolve();
      if (!active) return;
      void loadTeams();
    }
    void init();
    return () => {
      active = false;
      teamsAbortRef.current?.abort();
    };
  }, [loadTeams]);

  // Load detail & tasks & categories whenever selectedTeamId changes
  useEffect(() => {
    let active = true;
    async function load() {
      await Promise.resolve();
      if (!active) return;
      if (!selectedTeamId) {
        detailAbortRef.current?.abort();
        tasksAbortRef.current?.abort();
        categoriesAbortRef.current?.abort();
        setSelectedTeam(null);
        setTeamTasks([]);
        setTeamCategories([]);
        setSelectedTask(null);
        setDrawerOpen(false);
        return;
      }
      void loadTeamDetail(selectedTeamId);
      void loadTeamTasks(selectedTeamId);
      void loadTeamCategories(selectedTeamId);
    }
    void load();
    return () => {
      active = false;
      detailAbortRef.current?.abort();
      tasksAbortRef.current?.abort();
      categoriesAbortRef.current?.abort();
    };
  }, [selectedTeamId, loadTeamDetail, loadTeamTasks, loadTeamCategories]);

  // External refresh trigger (e.g. AI Assistant mutations)
  const prevRefreshTriggerRef = useRef(refreshTrigger);
  useEffect(() => {
    if (
      refreshTrigger === undefined ||
      refreshTrigger <= 0 ||
      refreshTrigger === prevRefreshTriggerRef.current
    ) {
      return;
    }
    prevRefreshTriggerRef.current = refreshTrigger;

    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      const activeTeamId = selectedTeamRef.current?.id ?? selectedTeamIdRef.current ?? undefined;
      const updatedTeams = await loadTeams(activeTeamId);
      if (!active) return;
      if (activeTeamId && updatedTeams.some((t) => t.id === activeTeamId)) {
        void loadTeamDetail(activeTeamId);
        void loadTeamTasks(activeTeamId);
      }
    });

    return () => {
      active = false;
    };
  }, [refreshTrigger, loadTeams, loadTeamDetail, loadTeamTasks]);

  // Realtime Team synchronization
  const pendingRealtimeSyncRef = useRef<{
    reloadList: boolean;
    reloadDetailTeamId: number | null;
    removedTeamId: number | null;
    deletedTeamId: number | null;
  }>({
    reloadList: false,
    reloadDetailTeamId: null,
    removedTeamId: null,
    deletedTeamId: null,
  });

  const debouncedRealtimeSyncRef = useRef<ReturnType<typeof createDebouncedCallback> | null>(null);

  useEffect(() => {
    const debounced = createDebouncedCallback(() => {
      const pending = pendingRealtimeSyncRef.current;
      pendingRealtimeSyncRef.current = {
        reloadList: false,
        reloadDetailTeamId: null,
        removedTeamId: null,
        deletedTeamId: null,
      };

      const activeId = selectedTeamIdRef.current;
      if (pending.removedTeamId !== null && pending.removedTeamId === activeId) {
        message.info('Bạn không còn là thành viên của nhóm đang xem');
      } else if (pending.deletedTeamId !== null && pending.deletedTeamId === activeId) {
        message.info('Nhóm đang xem đã bị giải tán');
      }

      if (pending.reloadList) {
        void loadTeams(activeId ?? undefined);
      }

      const isActiveInvalidated =
        activeId !== null &&
        (pending.removedTeamId === activeId || pending.deletedTeamId === activeId);

      if (
        !isActiveInvalidated &&
        pending.reloadDetailTeamId !== null &&
        pending.reloadDetailTeamId === activeId
      ) {
        void loadTeamDetail(activeId);
        void loadTeamTasks(activeId);
      }

      onTeamChanged?.();
    }, 300);

    debouncedRealtimeSyncRef.current = debounced;
    return () => {
      debounced.cancel();
      debouncedRealtimeSyncRef.current = null;
    };
  }, [loadTeams, loadTeamDetail, loadTeamTasks, onTeamChanged]);

  const handleRealtimeTeamEvent = useCallback(
    (event: RealtimeEventData) => {
      const decision = shouldRefreshTeamPageOnEvent({
        eventType: event.type,
        actorId: event.actorId,
        currentUserId: user?.id,
        event,
        selectedTeamId: selectedTeamIdRef.current,
      });

      if (!decision.shouldReloadList && !decision.shouldReloadDetail) {
        return;
      }

      const pending = pendingRealtimeSyncRef.current;
      pending.reloadList = pending.reloadList || decision.shouldReloadList;
      if (decision.wasCurrentUserRemoved && decision.targetTeamId !== null) {
        pending.removedTeamId = decision.targetTeamId;
        if (pending.reloadDetailTeamId === decision.targetTeamId) {
          pending.reloadDetailTeamId = null;
        }
      } else if (decision.wasSelectedTeamDeleted && decision.targetTeamId !== null) {
        pending.deletedTeamId = decision.targetTeamId;
        if (pending.reloadDetailTeamId === decision.targetTeamId) {
          pending.reloadDetailTeamId = null;
        }
      } else if (decision.shouldReloadDetail && decision.targetTeamId !== null) {
        pending.reloadDetailTeamId = decision.targetTeamId;
      }

      debouncedRealtimeSyncRef.current?.trigger();
    },
    [user?.id],
  );

  useRealtimeEvent('TEAM_UPDATED', handleRealtimeTeamEvent);
  useRealtimeEvent('TEAM_DELETED', handleRealtimeTeamEvent);

  // Debounced Task sync on realtime task events
  const debouncedTaskSyncRef = useRef<ReturnType<typeof createDebouncedCallback> | null>(null);

  useEffect(() => {
    const debounced = createDebouncedCallback(() => {
      const activeId = selectedTeamIdRef.current;
      if (activeId) {
        void loadTeamTasks(activeId);
      }
    }, 300);

    debouncedTaskSyncRef.current = debounced;
    return () => {
      debounced.cancel();
      debouncedTaskSyncRef.current = null;
    };
  }, [loadTeamTasks]);

  const handleRealtimeTaskEvent = useCallback(
    (event: RealtimeEventData) => {
      const activeId = selectedTeamIdRef.current;
      if (!activeId) return;
      if (event.teamId === activeId || event.teamId === undefined || event.teamId === null) {
        debouncedTaskSyncRef.current?.trigger();
      }
    },
    [],
  );

  useRealtimeEvent('TASK_CREATED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_UPDATED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_STATUS_CHANGED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_ASSIGNED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_DELETED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_RETURNED', handleRealtimeTaskEvent);
  useRealtimeEvent('SUBTASK_CREATED', handleRealtimeTaskEvent);
  useRealtimeEvent('SUBTASK_UPDATED', handleRealtimeTaskEvent);
  useRealtimeEvent('SUBTASK_DELETED', handleRealtimeTaskEvent);

  useRealtimeReconnect(() => {
    const previousActiveId = selectedTeamIdRef.current;
    void loadTeams(previousActiveId ?? undefined).then((data) => {
      if (previousActiveId && data.some((t) => t.id === previousActiveId)) {
        void loadTeamDetail(previousActiveId);
        void loadTeamTasks(previousActiveId);
      }
    });
  });

  const handleSelectTeam = useCallback((id: number) => {
    if (id !== selectedTeamIdRef.current) {
      setDetailError(null);
      setSelectedTeam(null);
      setSelectedTask(null);
      setCommandFilter('all');
      setAssigneeFilter(null);
      setSearchQuery('');
    }
    setSelectedTeamId(id);
    navigate(`/teams/${id}`, { replace: true });
  }, [navigate]);

  // Team Modals & Action handlers
  async function handleCreateTeam(values: CreateTeamPayload) {
    try {
      setActionSubmitting(true);
      const newTeam = await createTeam(values);
      message.success(`Đã tạo nhóm "${newTeam.name}" thành công`);
      createForm.resetFields();
      setCreateModalOpen(false);
      await loadTeams(newTeam.id);
      onTeamChanged?.();
    } catch (err: unknown) {
      if (isAbortError(err) || isUnauthorizedError(err)) return;
      message.error(getFriendlyErrorMessage(err, 'Không thể tạo nhóm'));
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleEditTeam(values: UpdateTeamPayload) {
    if (!selectedTeamId) return;
    try {
      setActionSubmitting(true);
      await updateTeam(selectedTeamId, values);
      message.success('Cập nhật thông tin nhóm thành công');
      setEditModalOpen(false);
      await loadTeams(selectedTeamId);
      await loadTeamDetail(selectedTeamId);
      onTeamChanged?.();
    } catch (err: unknown) {
      if (isAbortError(err) || isUnauthorizedError(err)) return;
      message.error(getFriendlyErrorMessage(err, 'Không thể cập nhật nhóm'));
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleDeleteTeam() {
    if (!selectedTeamId) return;
    try {
      setActionSubmitting(true);
      await deleteTeam(selectedTeamId);
      message.success('Đã giải tán nhóm thành công');
      await loadTeams();
      onTeamChanged?.();
    } catch (err: unknown) {
      if (isAbortError(err) || isUnauthorizedError(err)) return;
      if (err instanceof ApiError && err.status === 409) {
        const errData = err.data as
          | { code?: string; taskCount?: number; categoryCount?: number }
          | undefined;
        if (
          errData?.code === 'TEAM_HAS_DEPENDENT_DATA' ||
          errData?.taskCount !== undefined ||
          errData?.categoryCount !== undefined
        ) {
          const taskCount = errData?.taskCount ?? 0;
          const categoryCount = errData?.categoryCount ?? 0;
          message.error(
            `Không thể giải tán nhóm vì nhóm đang có ${taskCount} công việc và ${categoryCount} danh mục. Dữ liệu công việc cần được bảo toàn. Vui lòng xử lý dữ liệu liên quan trước khi xóa nhóm.`,
            8,
          );
          return;
        }
      }
      message.error(getFriendlyErrorMessage(err, 'Không thể xóa nhóm'));
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleAddMember(values: AddMemberPayload) {
    if (!selectedTeamId) return;
    try {
      setActionSubmitting(true);
      await addTeamMember(selectedTeamId, values);
      message.success('Thêm thành viên thành công');
      addMemberForm.resetFields();
      setAddMemberModalOpen(false);
      await loadTeamDetail(selectedTeamId);
      await loadTeams(selectedTeamId);
      onTeamChanged?.();
    } catch (err: unknown) {
      if (isAbortError(err) || isUnauthorizedError(err)) return;
      message.error(getFriendlyErrorMessage(err, 'Không thể thêm thành viên'));
    } finally {
      setActionSubmitting(false);
    }
  }

  const handleUpdateMemberRole = useCallback(
    async (memberId: number, role: TeamRole) => {
      const activeId = selectedTeamIdRef.current;
      if (!activeId) return;
      try {
        await updateTeamMemberRole(activeId, memberId, role);
        message.success('Đã thay đổi vai trò thành viên');
        await loadTeamDetail(activeId);
      } catch (err: unknown) {
        if (isAbortError(err) || isUnauthorizedError(err)) return;
        message.error(getFriendlyErrorMessage(err, 'Không thể cập nhật vai trò'));
      }
    },
    [loadTeamDetail],
  );

  const handleRemoveMember = useCallback(
    async (memberId: number) => {
      const activeId = selectedTeamIdRef.current;
      if (!activeId) return;
      try {
        await removeTeamMember(activeId, memberId);
        message.success('Đã xóa thành viên khỏi nhóm');
        await loadTeamDetail(activeId);
        await loadTeams(activeId);
        onTeamChanged?.();
      } catch (err: unknown) {
        if (isAbortError(err) || isUnauthorizedError(err)) return;
        message.error(getFriendlyErrorMessage(err, 'Không thể xóa thành viên'));
      }
    },
    [loadTeamDetail, loadTeams, onTeamChanged],
  );

  async function handleLeaveTeam(memberId: number) {
    if (!selectedTeamId) return;
    try {
      await removeTeamMember(selectedTeamId, memberId);
      message.success('Đã rời khỏi nhóm');
      await loadTeams();
      onTeamChanged?.();
    } catch (err: unknown) {
      if (isAbortError(err) || isUnauthorizedError(err)) return;
      message.error(getFriendlyErrorMessage(err, 'Không thể rời nhóm'));
    }
  }

  const handleTransferOwnership = useCallback(
    async (newOwnerId: number) => {
      const activeId = selectedTeamIdRef.current;
      if (!activeId) return;
      try {
        setActionSubmitting(true);
        await transferOwnership(activeId, newOwnerId);
        message.success('Đã chuyển quyền sở hữu nhóm thành công');
        await loadTeamDetail(activeId);
        await loadTeams(activeId);
        onTeamChanged?.();
      } catch (err: unknown) {
        if (isAbortError(err) || isUnauthorizedError(err)) return;
        message.error(getFriendlyErrorMessage(err, 'Không thể chuyển quyền sở hữu'));
      } finally {
        setActionSubmitting(false);
      }
    },
    [loadTeamDetail, loadTeams, onTeamChanged],
  );

  // Inline Quick Task Mutation handlers
  const handleUpdateStatus = useCallback(
    async (taskId: number, status: TaskStatus) => {
      const prevTasks = teamTasks;
      setTeamTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status } : t)),
      );
      if (selectedTaskRef.current?.id === taskId) {
        setSelectedTask((prev) => (prev ? { ...prev, status } : null));
      }
      try {
        const updated = await updateTaskStatus(taskId, status);
        setTeamTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
        );
        if (selectedTaskRef.current?.id === taskId) {
          setSelectedTask((prev) => (prev ? { ...prev, ...updated } : null));
        }
        message.success('Đã cập nhật trạng thái công việc');
      } catch (err: unknown) {
        setTeamTasks(prevTasks);
        if (selectedTaskRef.current?.id === taskId) {
          setSelectedTask(prevTasks.find((t) => t.id === taskId) || null);
        }
        message.error(getFriendlyErrorMessage(err, 'Không thể cập nhật trạng thái'));
      }
    },
    [teamTasks],
  );

  const handleUpdateAssignee = useCallback(
    async (taskId: number, assigneeId: number | null) => {
      const prevTasks = teamTasks;
      const assigneeUser = assigneeId
        ? selectedTeam?.members?.find((m) => m.userId === assigneeId)?.user ||
          (selectedTeam?.ownerId === assigneeId ? selectedTeam.owner : undefined)
        : null;

      setTeamTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                assigneeId,
                assignee: assigneeUser
                  ? { id: assigneeUser.id, name: assigneeUser.name, email: assigneeUser.email }
                  : null,
              }
            : t,
        ),
      );
      if (selectedTaskRef.current?.id === taskId) {
        setSelectedTask((prev) =>
          prev
            ? {
                ...prev,
                assigneeId,
                assignee: assigneeUser
                  ? { id: assigneeUser.id, name: assigneeUser.name, email: assigneeUser.email }
                  : null,
              }
            : null,
        );
      }
      try {
        const updated = await updateTaskAssignee(taskId, assigneeId);
        setTeamTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
        );
        if (selectedTaskRef.current?.id === taskId) {
          setSelectedTask((prev) => (prev ? { ...prev, ...updated } : null));
        }
        message.success('Đã phân công lại công việc');
      } catch (err: unknown) {
        setTeamTasks(prevTasks);
        if (selectedTaskRef.current?.id === taskId) {
          setSelectedTask(prevTasks.find((t) => t.id === taskId) || null);
        }
        message.error(getFriendlyErrorMessage(err, 'Không thể phân công công việc'));
      }
    },
    [teamTasks, selectedTeam],
  );

  const handleUpdateDueDate = useCallback(
    async (taskId: number, dueDate: string | null) => {
      const prevTasks = teamTasks;
      setTeamTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, dueDate } : t)),
      );
      if (selectedTaskRef.current?.id === taskId) {
        setSelectedTask((prev) => (prev ? { ...prev, dueDate } : null));
      }
      try {
        const updated = await updateTaskContent(taskId, { dueDate: dueDate ?? null });
        setTeamTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
        );
        if (selectedTaskRef.current?.id === taskId) {
          setSelectedTask((prev) => (prev ? { ...prev, ...updated } : null));
        }
        message.success('Đã cập nhật hạn hoàn thành');
      } catch (err: unknown) {
        setTeamTasks(prevTasks);
        if (selectedTaskRef.current?.id === taskId) {
          setSelectedTask(prevTasks.find((t) => t.id === taskId) || null);
        }
        message.error(getFriendlyErrorMessage(err, 'Không thể cập nhật hạn hoàn thành'));
      }
    },
    [teamTasks],
  );

  const handleUpdatePriority = useCallback(
    async (taskId: number, priority: TaskPriority) => {
      const prevTasks = teamTasks;
      setTeamTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, priority } : t)),
      );
      if (selectedTaskRef.current?.id === taskId) {
        setSelectedTask((prev) => (prev ? { ...prev, priority } : null));
      }
      try {
        const updated = await updateTaskContent(taskId, { priority });
        setTeamTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
        );
        if (selectedTaskRef.current?.id === taskId) {
          setSelectedTask((prev) => (prev ? { ...prev, ...updated } : null));
        }
        message.success('Đã cập nhật độ ưu tiên');
      } catch (err: unknown) {
        setTeamTasks(prevTasks);
        if (selectedTaskRef.current?.id === taskId) {
          setSelectedTask(prevTasks.find((t) => t.id === taskId) || null);
        }
        message.error(getFriendlyErrorMessage(err, 'Không thể cập nhật độ ưu tiên'));
      }
    },
    [teamTasks],
  );

  const handleReturnTask = useCallback(
    async (taskId: number, reason: string) => {
      try {
        const updated = await returnTask(taskId, reason);
        setTeamTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
        );
        if (selectedTaskRef.current?.id === taskId) {
          setSelectedTask((prev) => (prev ? { ...prev, ...updated } : null));
        }
        message.success('Đã trả lại công việc');
      } catch (err: unknown) {
        message.error(getFriendlyErrorMessage(err, 'Không thể trả lại công việc'));
      }
    },
    [],
  );

  const handleDeleteTask = useCallback(async (task: Task) => {
    try {
      await deleteTask(task.id);
      setTeamTasks((prev) => prev.filter((t) => t.id !== task.id));
      if (selectedTaskRef.current?.id === task.id) {
        setSelectedTask(null);
      }
      message.success(`Đã xóa công việc "${task.title}"`);
    } catch (err: unknown) {
      message.error(getFriendlyErrorMessage(err, 'Không thể xóa công việc'));
    }
  }, []);

  const handleSubtasksChange = useCallback((taskId: number, subtasks: Subtask[]) => {
    setTeamTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, subtasks } : t)),
    );
    setSelectedTask((prev) =>
      prev && prev.id === taskId ? { ...prev, subtasks } : prev,
    );
    setTaskModalTask((prev) =>
      prev && prev.id === taskId ? { ...prev, subtasks } : prev,
    );
  }, []);

  // Permissions & Derived metrics
  const isOwner = selectedTeam?.ownerId === user?.id;
  const isAdmin = selectedTeam?.currentUserRole === 'ADMIN' && !isOwner;
  const canManageMembers = isOwner || isAdmin;
  const canCreateTask = isOwner || isAdmin || selectedTeam?.currentUserRole === 'MEMBER';

  // Adjust activeTab during render if user loses permission for activity tab
  if (activeTab === 'activity' && !canManageMembers) {
    setActiveTab('tasks');
  }

  const metrics: TeamCommandMetrics = useMemo(() => {
    return computeTeamCommandMetrics(teamTasks);
  }, [teamTasks]);

  const filteredTasks = useMemo(() => {
    return filterTeamTasks(teamTasks, {
      filterType: commandFilter,
      assigneeId: assigneeFilter ?? undefined,
      searchQuery,
    });
  }, [teamTasks, commandFilter, assigneeFilter, searchQuery]);

  const getAssigneeName = useCallback(
    (userId: number | null): string => {
      if (userId === null) return 'Chưa phân công';
      if (selectedTeam?.ownerId === userId && selectedTeam.owner) {
        return selectedTeam.owner.name;
      }
      const member = selectedTeam?.members.find((m) => m.userId === userId);
      return member?.user?.name || `ID #${userId}`;
    },
    [selectedTeam],
  );

  // Tab items configuration
  const tabItems = useMemo(() => {
    const items = [
      {
        key: 'tasks',
        label: (
          <span>
            <UnorderedListOutlined /> Công việc ({teamTasks.length})
          </span>
        ),
        children: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Table Toolbar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
                <Input
                  placeholder="Tìm công việc theo tiêu đề, người phụ trách..."
                  prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  allowClear
                  style={{ maxWidth: 360, borderRadius: 6 }}
                />
                {(commandFilter !== 'all' || assigneeFilter !== null) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {commandFilter !== 'all' && (
                      <Tag
                        color="blue"
                        closable
                        onClose={() => setCommandFilter('all')}
                      >
                        Lọc: {getFilterLabel(commandFilter)}
                      </Tag>
                    )}
                    {assigneeFilter !== null && (
                      <Tag
                        color="cyan"
                        closable
                        onClose={() => setAssigneeFilter(null)}
                      >
                        Người làm: {getAssigneeName(assigneeFilter)}
                      </Tag>
                    )}
                    <Button
                      type="link"
                      size="small"
                      onClick={() => {
                        setCommandFilter('all');
                        setAssigneeFilter(null);
                      }}
                      style={{ padding: 0, fontSize: 12 }}
                    >
                      Xóa lọc
                    </Button>
                  </div>
                )}
              </div>

              {isMobileOrTablet && (
                <Button
                  size="small"
                  icon={<ExclamationCircleOutlined />}
                  onClick={() => setDrawerOpen(true)}
                >
                  Cần xử lý ({metrics.overdue + metrics.dueSoon})
                </Button>
              )}
            </div>

            {/* Task Table */}
            <TeamTaskTable
              tasks={filteredTasks}
              loading={tasksLoading}
              selectedTaskId={selectedTask?.id}
              onSelectTask={(task) => {
                setSelectedTask(task);
                if (isMobileOrTablet) {
                  setDrawerOpen(true);
                }
              }}
              onUpdateStatus={handleUpdateStatus}
              onUpdateAssignee={handleUpdateAssignee}
              onUpdateDueDate={handleUpdateDueDate}
              onDeleteTask={(task) => {
                void handleDeleteTask(task);
              }}
              team={selectedTeam}
              currentUser={user}
            />
          </div>
        ),
      },
      {
        key: 'members',
        label: (
          <span>
            <UserOutlined /> Thành viên ({buildTeamMemberOptions(selectedTeam).length})
          </span>
        ),
        children: (
          <TeamMembersTab
            team={selectedTeam}
            currentUserId={user?.id}
            isOwner={isOwner}
            canManageMembers={canManageMembers}
            onOpenAddMember={() => {
              addMemberForm.resetFields();
              setAddMemberModalOpen(true);
            }}
            onUpdateMemberRole={handleUpdateMemberRole}
            onTransferOwnership={handleTransferOwnership}
            onRemoveMember={handleRemoveMember}
          />
        ),
      },
    ];

    if (canManageMembers) {
      items.push({
        key: 'activity',
        label: (
          <span>
            <HistoryOutlined /> Hoạt động
          </span>
        ),
        children: selectedTeam ? (
          <TeamActivitySection
            key={`act-${selectedTeam.id}`}
            teamId={selectedTeam.id}
            members={selectedTeam.members}
            owner={selectedTeam.owner}
            canView={canManageMembers}
          />
        ) : (
          <div />
        ),
      });
    }

    return items;
  }, [
    teamTasks.length,
      searchQuery,
      commandFilter,
      assigneeFilter,
      isMobileOrTablet,
      metrics.overdue,
      metrics.dueSoon,
      filteredTasks,
      tasksLoading,
      selectedTask?.id,
      selectedTeam,
      user,
      handleUpdateStatus,
      handleUpdateAssignee,
      handleUpdateDueDate,
      handleDeleteTask,
      isOwner,
      canManageMembers,
      addMemberForm,
      handleTransferOwnership,
      handleUpdateMemberRole,
      handleRemoveMember,
      getAssigneeName,
    ],
  );

  // Global Page states (No teams, Error, Loading)
  if (loading && teams.length === 0 && !teamsError) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (Boolean(teamsError) && teams.length === 0) {
    return (
      <ApiErrorFallback
        variant="page"
        error={teamsError}
        onRetry={() => void loadTeams()}
        retrying={loading}
        showNavigation
      />
    );
  }

  if (teams.length === 0) {
    return (
      <Card style={{ borderRadius: 8, textAlign: 'center', padding: '40px 0', maxWidth: 600, margin: '40px auto' }}>
        <Empty
          description="Bạn chưa tham gia nhóm làm việc nào"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              createForm.resetFields();
              setCreateModalOpen(true);
            }}
          >
            Tạo nhóm đầu tiên
          </Button>
        </Empty>
        <TeamModals
          createModalOpen={createModalOpen}
          editModalOpen={false}
          addMemberModalOpen={false}
          actionSubmitting={actionSubmitting}
          isOwner={false}
          createForm={createForm}
          editForm={editForm}
          addMemberForm={addMemberForm}
          onCloseCreateModal={() => setCreateModalOpen(false)}
          onCloseEditModal={() => setEditModalOpen(false)}
          onCloseAddMemberModal={() => setAddMemberModalOpen(false)}
          onCreateTeam={handleCreateTeam}
          onEditTeam={handleEditTeam}
          onAddMember={handleAddMember}
        />
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: '0 8px 40px' }}>
      {/* Team Command Center Header */}
      <TeamCommandHeader
        teams={teams}
        selectedTeam={selectedTeam}
        onSelectTeamId={handleSelectTeam}
        onOpenCreateTask={() => {
          setQuickAssignOpen(true);
        }}
        onOpenManageCategories={() => setTeamCategoryModalOpen(true)}
        canCreateTask={canCreateTask}
        canManageTeam={canManageMembers}
        isOwner={isOwner}
        onOpenEditTeam={() => {
          if (!selectedTeam) return;
          editForm.setFieldsValue({
            name: selectedTeam.name,
            description: selectedTeam.description || '',
          });
          setEditModalOpen(true);
        }}
        onOpenAddMember={() => {
          addMemberForm.resetFields();
          setAddMemberModalOpen(true);
        }}
        onOpenTransferOwnership={() => {
          setActiveTab('members');
          message.info('Vui lòng chọn nút Chuyển quyền tại bảng thành viên bên dưới');
        }}
        onDeleteTeam={handleDeleteTeam}
        onLeaveTeam={() => {
          const selfMember = selectedTeam?.members.find((m) => m.userId === user?.id);
          if (selfMember) {
            void handleLeaveTeam(selfMember.id);
          }
        }}
      />

      {/* Detail load fallback if failure */}
      {Boolean(detailError) && !selectedTeam && (
        <div style={{ marginTop: 16 }}>
          <ApiErrorFallback
            variant="inline"
            error={detailError}
            onRetry={() => {
              if (selectedTeamId) {
                void loadTeamDetail(selectedTeamId);
              }
            }}
            retrying={detailLoading}
            showNavigation={false}
          />
        </div>
      )}

      {selectedTeam && (
        <>
          {/* Stat Strip */}
          <div style={{ margin: '16px 0', overflowX: 'hidden' }}>
            <TeamStatStrip
              metrics={metrics}
              activeFilter={commandFilter}
              onSelectFilter={(filter) => {
                setCommandFilter(filter);
                if (activeTab !== 'tasks') {
                  setActiveTab('tasks');
                }
              }}
            />
          </div>

          {/* Main Workspace (72% Left Tab area + 28% Right Command Panel) */}
          <div style={{ overflowX: 'hidden' }}>
            <Row gutter={[16, 16]}>
            <Col xs={24} lg={17} xl={17}>
              <Card
                variant="borderless"
                style={{
                  borderRadius: 8,
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
                  background: '#ffffff',
                }}
                styles={{ body: { padding: '12px 16px 16px' } }}
              >
                <Tabs
                  activeKey={activeTab}
                  onChange={(key) => setActiveTab(key as typeof activeTab)}
                  items={tabItems}
                />
              </Card>
            </Col>

            <Col xs={24} lg={7} xl={7}>
              <TeamCommandPanel
                contextMode={activeTab}
                metrics={metrics}
                members={selectedTeam.members}
                tasks={teamTasks}
                selectedTask={selectedTask}
                onCloseTask={() => setSelectedTask(null)}
                onSelectFilter={(filter) => {
                  setCommandFilter(filter);
                  if (activeTab !== 'tasks') {
                    setActiveTab('tasks');
                  }
                }}
                onSelectAssigneeFilter={(userId) => {
                  setAssigneeFilter(userId);
                  if (activeTab !== 'tasks') {
                    setActiveTab('tasks');
                  }
                }}
                activeFilter={commandFilter}
                activeAssigneeId={assigneeFilter}
                team={selectedTeam}
                currentUser={user}
                onOpenFullModal={(task, tab = 'info') => {
                  setTaskModalTask(task);
                  setTaskModalTab(tab);
                  setTaskModalOpen(true);
                }}
                onUpdateStatus={handleUpdateStatus}
                onUpdateAssignee={handleUpdateAssignee}
                onUpdateDueDate={handleUpdateDueDate}
                onUpdatePriority={handleUpdatePriority}
                onReturnTask={handleReturnTask}
                onSubtasksChange={handleSubtasksChange}
                isDrawerOpen={drawerOpen}
                onCloseDrawer={() => setDrawerOpen(false)}
              />
            </Col>
          </Row>
          </div>
        </>
      )}

      {/* Modals */}
      <TeamModals
        createModalOpen={createModalOpen}
        editModalOpen={editModalOpen}
        addMemberModalOpen={addMemberModalOpen}
        actionSubmitting={actionSubmitting}
        isOwner={isOwner}
        createForm={createForm}
        editForm={editForm}
        addMemberForm={addMemberForm}
        onCloseCreateModal={() => setCreateModalOpen(false)}
        onCloseEditModal={() => setEditModalOpen(false)}
        onCloseAddMemberModal={() => setAddMemberModalOpen(false)}
        onCreateTeam={handleCreateTeam}
        onEditTeam={handleEditTeam}
        onAddMember={handleAddMember}
      />

      <Modal
        title={`Danh mục nhóm — ${selectedTeam?.name || ''}`}
        open={teamCategoryModalOpen}
        onCancel={() => {
          setTeamCategoryModalOpen(false);
          if (selectedTeamId) {
            void loadTeamCategories(selectedTeamId);
          }
        }}
        footer={null}
        width={640}
        destroyOnClose
      >
        {selectedTeam && (
          <TeamCategorySection
            key={`cat-modal-${selectedTeam.id}`}
            teamId={selectedTeam.id}
            canManage={canManageMembers}
          />
        )}
      </Modal>

      <TeamQuickAssignDrawer
        open={quickAssignOpen}
        team={selectedTeam}
        categories={teamCategories}
        currentUserId={user?.id}
        onClose={() => setQuickAssignOpen(false)}
        onSuccess={async () => {
          if (selectedTeamId) {
            await loadTeamTasks(selectedTeamId);
          }
          onTeamChanged?.();
        }}
      />

      <TaskFormModal
        key={`${taskModalTask?.id ?? 'team-modal'}-${taskModalTab}`}
        open={taskModalOpen}
        task={
          taskModalTask
            ? (teamTasks.find((t) => t.id === taskModalTask.id) ?? taskModalTask)
            : null
        }
        initialTab={taskModalTab}
        defaultTeamId={selectedTeamId}
        categories={teamCategories}
        teams={teams}
        onClose={() => {
          setTaskModalOpen(false);
          setTaskModalTask(null);
          setTaskModalTab('info');
        }}
        onSuccess={async () => {
          if (selectedTeamId) {
            await loadTeamTasks(selectedTeamId);
          }
        }}
        onSubtasksChange={handleSubtasksChange}
        onDelete={async (id) => {
          try {
            await deleteTask(id);
            setTeamTasks((prev) => prev.filter((t) => t.id !== id));
            if (selectedTask?.id === id) {
              setSelectedTask(null);
            }
            setTaskModalOpen(false);
            setTaskModalTask(null);
            message.success('Đã xóa công việc');
          } catch (err: unknown) {
            message.error(getFriendlyErrorMessage(err, 'Không thể xóa công việc'));
          }
        }}
      />
    </div>
  );
}
