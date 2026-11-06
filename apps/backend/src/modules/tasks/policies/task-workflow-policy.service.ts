import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { TaskPolicyService, type TaskWithTeamAndMembers } from './task-policy.service.js';

export type TaskActorRole = 'OWNER' | 'ADMIN' | 'CREATOR' | 'ASSIGNEE' | 'MEMBER';

@Injectable()
export class TaskWorkflowPolicy {
  constructor(private readonly policy: TaskPolicyService) {}

  getActorRole(userId: number, task: TaskWithTeamAndMembers): TaskActorRole {
    if (task.teamId === null || !task.team) {
      return task.userId === userId ? 'OWNER' : 'MEMBER';
    }
    if (this.policy.isOwner(userId, task.team)) {
      return 'OWNER';
    }
    if (this.policy.isAdmin(userId, task.team)) {
      return 'ADMIN';
    }
    if (task.userId === userId) {
      return 'CREATOR';
    }
    if (task.assigneeId === userId) {
      return 'ASSIGNEE';
    }
    return 'MEMBER';
  }

  canTransition(
    userId: number,
    task: TaskWithTeamAndMembers,
    nextStatus: TaskStatus,
  ): boolean {
    if (task.status === nextStatus) {
      return true;
    }

    if (task.teamId === null || !task.team) {
      return task.userId === userId;
    }

    if (!this.policy.isTeamMember(userId, task.team)) {
      return false;
    }

    const role = this.getActorRole(userId, task);

    if (role === 'OWNER' || role === 'ADMIN' || role === 'CREATOR') {
      return true;
    }

    if (role === 'ASSIGNEE') {
      if (task.status === TaskStatus.DONE) {
        return false;
      }
      if (task.status === TaskStatus.IN_PROGRESS && nextStatus === TaskStatus.TODO) {
        return false;
      }
      return true;
    }

    return false;
  }
}
