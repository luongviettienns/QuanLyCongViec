import type {
  Team,
  TeamMember,
  TeamRole,
  CreateTeamPayload,
  UpdateTeamPayload,
  AddMemberPayload,
} from '../types/team.types';
import {
  getAuthHeaders,
  handleApiResponse,
  handleVoidApiResponse,
} from '../../auth/api/auth.api';

export async function getTeams(signal?: AbortSignal): Promise<Team[]> {
  const response = await fetch('/teams', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    signal,
  });

  return handleApiResponse<Team[]>(response, 'Không thể tải danh sách nhóm');
}

export async function getTeamById(id: number, signal?: AbortSignal): Promise<Team> {
  const response = await fetch(`/teams/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    signal,
  });

  return handleApiResponse<Team>(response, `Không thể tải thông tin nhóm #${id}`);
}

export async function createTeam(payload: CreateTeamPayload): Promise<Team> {
  const response = await fetch('/teams', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<Team>(response, 'Không thể tạo nhóm mới');
}

export async function updateTeam(id: number, payload: UpdateTeamPayload): Promise<Team> {
  const response = await fetch(`/teams/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<Team>(response, 'Không thể cập nhật thông tin nhóm');
}

export async function deleteTeam(id: number): Promise<void> {
  const response = await fetch(`/teams/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  await handleVoidApiResponse(response, 'Không thể giải tán nhóm');
}

export async function addTeamMember(teamId: number, payload: AddMemberPayload): Promise<TeamMember> {
  const response = await fetch(`/teams/${teamId}/members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<TeamMember>(response, 'Không thể thêm thành viên vào nhóm');
}

export async function updateTeamMemberRole(
  teamId: number,
  memberId: number,
  role: TeamRole,
): Promise<TeamMember> {
  const response = await fetch(`/teams/${teamId}/members/${memberId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ role }),
  });

  return handleApiResponse<TeamMember>(response, 'Không thể thay đổi vai trò thành viên');
}

export async function transferOwnership(teamId: number, newOwnerId: number): Promise<Team> {
  const response = await fetch(`/teams/${teamId}/transfer-ownership`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ newOwnerId }),
  });

  return handleApiResponse<Team>(response, 'Không thể chuyển quyền sở hữu nhóm');
}

export async function removeTeamMember(teamId: number, memberId: number): Promise<void> {
  const response = await fetch(`/teams/${teamId}/members/${memberId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  await handleVoidApiResponse(response, 'Không thể xóa thành viên khỏi nhóm');
}
