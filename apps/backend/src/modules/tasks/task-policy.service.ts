import { Injectable } from '@nestjs/common';
import { TeamRole, type Task, type TeamMember } from '@prisma/client';

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
    if (member.role === TeamRole.OWNER || member.role === TeamRole.ADMIN) {
      return true;
    }
    return task.userId === userId;
  }

  canChangeStatus(userId: number, task: TaskWithTeamAndMembers): boolean {
    if (task.teamId === null || !task.team) {
      return task.userId === userId;
    }
    const member = task.team.members.find((m) => m.userId === userId);
    if (!member) {
      return false;
    }
    if (member.role === TeamRole.OWNER || member.role === TeamRole.ADMIN) {
      return true;
    }
    if (task.userId === userId) {
      return true;
    }
    return task.assigneeId === userId;
  }

  canChangeAssignee(userId: number, task: TaskWithTeamAndMembers): boolean {
    if (task.teamId === null || !task.team) {
      return task.userId === userId;
    }
    const member = task.team.members.find((m) => m.userId === userId);
    if (!member) {
      return false;
    }
    if (member.role === TeamRole.OWNER || member.role === TeamRole.ADMIN) {
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
    if (member.role === TeamRole.OWNER || member.role === TeamRole.ADMIN) {
      return true;
    }
    return task.userId === userId;
  }
}
