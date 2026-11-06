import { Injectable } from '@nestjs/common';
import { TeamRole, TaskStatus, type Task, type TeamMember } from '@prisma/client';

export type TaskWithTeamAndMembers = Task & {
  team?: {
    id: number;
    ownerId: number;
    members: TeamMember[];
  } | null;
};

@Injectable()
export class TaskPolicyService {
  isOwner(userId: number, team?: { ownerId: number } | null): boolean {
    return team?.ownerId === userId;
  }

  isAdmin(userId: number, team?: { members?: TeamMember[] } | null): boolean {
    return team?.members?.some((m) => m.userId === userId && m.role === TeamRole.ADMIN) ?? false;
  }

  isAdminOrOwner(userId: number, team?: { ownerId: number; members?: TeamMember[] } | null): boolean {
    return this.isOwner(userId, team) || this.isAdmin(userId, team);
  }

  isTeamMember(userId: number, team?: { ownerId: number; members?: TeamMember[] } | null): boolean {
    return this.isOwner(userId, team) || (team?.members?.some((m) => m.userId === userId) ?? false);
  }

  canViewTask(userId: number, task: TaskWithTeamAndMembers): boolean {
    if (task.teamId === null || !task.team) {
      return task.userId === userId || task.assigneeId === userId;
    }
    return this.isTeamMember(userId, task.team);
  }

  canEditContent(userId: number, task: TaskWithTeamAndMembers): boolean {
    if (task.teamId === null || !task.team) {
      return task.userId === userId;
    }
    if (this.isAdminOrOwner(userId, task.team)) {
      return true;
    }
    if (!this.isTeamMember(userId, task.team)) {
      return false;
    }
    return task.userId === userId;
  }

  canChangeStatus(
    userId: number,
    task: TaskWithTeamAndMembers,
    newStatus?: TaskStatus,
  ): boolean {
    if (task.teamId === null || !task.team) {
      return task.userId === userId;
    }
    if (!this.isTeamMember(userId, task.team)) {
      return false;
    }
    if (this.isAdminOrOwner(userId, task.team)) {
      return true;
    }
    if (task.userId === userId) {
      return true;
    }
    if (task.assigneeId === userId) {
      if (newStatus !== undefined) {
        if (task.status === TaskStatus.DONE && newStatus !== TaskStatus.DONE) {
          return false;
        }
        if (task.status === TaskStatus.IN_PROGRESS && newStatus === TaskStatus.TODO) {
          return false;
        }
        return true;
      }
      return task.status !== TaskStatus.DONE;
    }
    return false;
  }

  canChangeAssignee(userId: number, task: TaskWithTeamAndMembers): boolean {
    if (task.teamId === null || !task.team) {
      return task.userId === userId;
    }
    if (this.isAdminOrOwner(userId, task.team)) {
      return true;
    }
    if (!this.isTeamMember(userId, task.team)) {
      return false;
    }
    return task.userId === userId;
  }

  canReturnTask(userId: number, task: TaskWithTeamAndMembers): boolean {
    if (task.teamId === null || !task.team) {
      return false;
    }
    if (task.status === TaskStatus.DONE) {
      return false;
    }
    if (task.assigneeId !== userId) {
      return false;
    }
    if (task.userId === userId) {
      return false;
    }
    return this.isTeamMember(userId, task.team);
  }

  canDeleteTask(userId: number, task: TaskWithTeamAndMembers): boolean {
    if (task.teamId === null || !task.team) {
      return task.userId === userId;
    }
    if (this.isAdminOrOwner(userId, task.team)) {
      return true;
    }
    if (!this.isTeamMember(userId, task.team)) {
      return false;
    }
    return task.userId === userId;
  }

  canReorder(
    userId: number,
    task: TaskWithTeamAndMembers,
    targetStatus?: TaskStatus,
  ): boolean {
    if (task.teamId === null || !task.team) {
      return task.userId === userId;
    }
    if (!this.isTeamMember(userId, task.team)) {
      return false;
    }
    if (!targetStatus || targetStatus === task.status) {
      return true;
    }
    return this.canChangeStatus(userId, task, targetStatus);
  }
}
