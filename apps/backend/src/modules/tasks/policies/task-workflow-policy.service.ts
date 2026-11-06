import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { TaskPolicyService, type TaskWithTeamAndMembers } from './task-policy.service.js';

export type TaskActorRole = 'OWNER' | 'ADMIN' | 'CREATOR' | 'ASSIGNEE' | 'MEMBER';

const ASSIGNEE_ALLOWED_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.DONE],
  [TaskStatus.DONE]: [],
};

@Injectable()
export class TaskWorkflowPolicy {
  constructor(private readonly policy: TaskPolicyService) {}

  getActorRoles(userId: number, task: TaskWithTeamAndMembers): TaskActorRole[] {
    if (task.teamId === null || !task.team) {
      if (task.userId === userId) {
        return task.assigneeId === userId
          ? ['OWNER', 'CREATOR', 'ASSIGNEE']
          : ['OWNER', 'CREATOR'];
      }
      if (task.assigneeId === userId) {
        return ['ASSIGNEE'];
      }
      return [];
    }

    if (!this.policy.isTeamMember(userId, task.team)) {
      return [];
    }

    const roles: TaskActorRole[] = [];
    if (this.policy.isOwner(userId, task.team)) {
      roles.push('OWNER');
    }
    if (this.policy.isAdmin(userId, task.team)) {
      roles.push('ADMIN');
    }
    if (task.userId === userId) {
      roles.push('CREATOR');
    }
    if (task.assigneeId === userId) {
      roles.push('ASSIGNEE');
    }
    roles.push('MEMBER');

    return roles;
  }

  getActorRole(userId: number, task: TaskWithTeamAndMembers): TaskActorRole {
    const roles = this.getActorRoles(userId, task);
    return roles[0] ?? 'MEMBER';
  }

  private canRoleTransition(
    role: TaskActorRole,
    currentStatus: TaskStatus,
    nextStatus: TaskStatus,
  ): boolean {
    if (role === 'OWNER' || role === 'ADMIN' || role === 'CREATOR') {
      return true;
    }

    if (role === 'ASSIGNEE') {
      if (currentStatus === nextStatus) {
        return currentStatus !== TaskStatus.DONE;
      }
      return ASSIGNEE_ALLOWED_TRANSITIONS[currentStatus].includes(nextStatus);
    }

    return false;
  }

  canTransition(
    userId: number,
    task: TaskWithTeamAndMembers,
    nextStatus: TaskStatus,
  ): boolean {
    if (task.teamId === null || !task.team) {
      return task.userId === userId;
    }

    const roles = this.getActorRoles(userId, task);
    if (roles.length === 0) {
      return false;
    }

    return roles.some((role) => this.canRoleTransition(role, task.status, nextStatus));
  }
}
