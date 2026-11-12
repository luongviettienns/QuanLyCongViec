import type { RealtimeEventType } from '../../realtime/types/realtime.types.ts';

export interface TeamRealtimeEnvelope {
  actorId?: number;
  teamId?: number | null;
  payload?: unknown;
}

export interface TeamPageRefreshDecision {
  shouldReloadList: boolean;
  shouldReloadDetail: boolean;
  targetTeamId: number | null;
  wasCurrentUserRemoved: boolean;
  wasSelectedTeamDeleted: boolean;
}

export function extractRealtimeTeamId(event: TeamRealtimeEnvelope): number | null {
  if (typeof event.teamId === 'number' && Number.isFinite(event.teamId) && event.teamId > 0) {
    return event.teamId;
  }
  const payload = event.payload as { teamId?: unknown } | undefined;
  if (payload && typeof payload.teamId === 'number' && Number.isFinite(payload.teamId) && payload.teamId > 0) {
    return payload.teamId;
  }
  return null;
}

export function shouldRefreshTeamPageOnEvent(params: {
  eventType: RealtimeEventType;
  actorId?: number;
  currentUserId?: number;
  event: TeamRealtimeEnvelope;
  selectedTeamId?: number | null;
}): TeamPageRefreshDecision {
  const targetTeamId = extractRealtimeTeamId(params.event);

  if (
    params.actorId !== undefined &&
    params.currentUserId !== undefined &&
    params.actorId === params.currentUserId
  ) {
    return {
      shouldReloadList: false,
      shouldReloadDetail: false,
      targetTeamId,
      wasCurrentUserRemoved: false,
      wasSelectedTeamDeleted: false,
    };
  }

  const isSelectedTeam =
    targetTeamId !== null &&
    params.selectedTeamId !== null &&
    params.selectedTeamId !== undefined &&
    params.selectedTeamId === targetTeamId;

  if (params.eventType === 'TEAM_DELETED') {
    return {
      shouldReloadList: true,
      shouldReloadDetail: false,
      targetTeamId,
      wasCurrentUserRemoved: false,
      wasSelectedTeamDeleted: isSelectedTeam,
    };
  }

  if (params.eventType === 'TEAM_UPDATED') {
    const payload = params.event.payload as
      | { action?: string; removedUserId?: number }
      | undefined;

    const removedCurrentUser =
      payload?.action === 'REMOVE_MEMBER' &&
      params.currentUserId !== undefined &&
      payload.removedUserId === params.currentUserId;

    return {
      shouldReloadList: true,
      shouldReloadDetail: isSelectedTeam && !removedCurrentUser,
      targetTeamId,
      wasCurrentUserRemoved: isSelectedTeam && removedCurrentUser,
      wasSelectedTeamDeleted: false,
    };
  }

  return {
    shouldReloadList: false,
    shouldReloadDetail: false,
    targetTeamId,
    wasCurrentUserRemoved: false,
    wasSelectedTeamDeleted: false,
  };
}

export function shouldRefreshTeamActivityOnEvent(params: {
  eventType: RealtimeEventType;
  activeTeamId: number;
  event: TeamRealtimeEnvelope;
}): boolean {
  if (params.eventType !== 'TEAM_ACTIVITY_CREATED') {
    return false;
  }
  return extractRealtimeTeamId(params.event) === params.activeTeamId;
}

export function shouldRefreshTeamCategoriesOnEvent(params: {
  eventType: RealtimeEventType;
  activeTeamId: number;
  currentUserId?: number;
  event: TeamRealtimeEnvelope;
}): boolean {
  if (params.eventType !== 'TEAM_CATEGORY_CHANGED') {
    return false;
  }
  if (
    params.currentUserId !== undefined &&
    params.event.actorId !== undefined &&
    params.event.actorId === params.currentUserId
  ) {
    return false;
  }
  return extractRealtimeTeamId(params.event) === params.activeTeamId;
}

export function createDebouncedCallback(fn: () => void, delayMs = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    trigger() {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delayMs);
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
