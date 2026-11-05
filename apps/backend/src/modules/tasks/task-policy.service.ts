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
  canViewTask(userId: number, task: TaskWithTeamAndMembers): boolean {
    if (task.teamId === null || !task.team) {
      return task.userId === userId;
    }
    return task.team.members.some((m) => m.userId === userId);
  }

  canEditContent(userId: number, task: TaskWithTeamAndMembers): boolean {
    if (task.teamId === null || !task.team) {
      return task.userId === userId;
    }
    const member = task.team.members.find((m) => m.userId === userId);
    if (!member) {
      return false;
    }
    if (member.role === TeamRole.ADMIN) {
      return true;
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
    const member = task.team.members.find((m) => m.userId === userId);
    if (!member) {
      return false;
    }
    if (member.role === TeamRole.ADMIN) {
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
    const member = task.team.members.find((m) => m.userId === userId);
    if (!member) {
      return false;
    }
    if (member.role === TeamRole.ADMIN) {
      return true;
    }
    return task.userId === userId;
  }

  canReturnTask(userId: number, task: TaskWithTeamAndMembers): boolean {
    if (task.teamId === null || !task.team) {
      return false;
    }
    if (task.assigneeId !== userId) {
      return false;
    }
    if (task.userId === userId) {
      return false;
    }
    return task.team.members.some((m) => m.userId === userId);
  }

  canDeleteTask(userId: number, task: TaskWithTeamAndMembers): boolean {
    if (task.teamId === null || !task.team) {
      return task.userId === userId;
    }
    const member = task.team.members.find((m) => m.userId === userId);
    if (!member) {
      return false;
    }
    if (member.role === TeamRole.ADMIN) {
      return true;
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
    const member = task.team.members.find((m) => m.userId === userId);
    if (!member) {
      return false;
    }
    if (!targetStatus || targetStatus === task.status) {
      return true;
    }
    return this.canChangeStatus(userId, task, targetStatus);
  }
}
