import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import type { Prisma } from '@prisma/client';
import type { DomainNotificationEvent } from '../types/notification-event.types.js';

@Injectable()
export class NotificationRecipientService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves recipient user IDs for a domain event, excluding the actor and deduplicating.
   */
  async resolveRecipients(
    event: DomainNotificationEvent,
    txClient?: Prisma.TransactionClient,
  ): Promise<number[]> {
    const prisma = txClient || this.prisma;
    const candidateIds: number[] = [];

    switch (event.type) {
      case 'TASK_ASSIGNED':
        if (event.assigneeId) {
          candidateIds.push(event.assigneeId);
        }
        break;

      case 'TASK_UNASSIGNED':
        if (event.previousAssigneeId) {
          candidateIds.push(event.previousAssigneeId);
        }
        if (event.teamId) {
          const team = await prisma.team.findUnique({
            where: { id: event.teamId },
            select: {
              ownerId: true,
              members: {
                where: { role: 'ADMIN' },
                select: { userId: true },
              },
            },
          });
          if (team?.ownerId) {
            candidateIds.push(team.ownerId);
          }
          if (team?.members) {
            for (const m of team.members) {
              candidateIds.push(m.userId);
            }
          }
        }
        break;

      case 'TASK_STATUS_CHANGED':
        candidateIds.push(event.creatorId);
        if (event.assigneeId) {
          candidateIds.push(event.assigneeId);
        }
        break;

      case 'TASK_COMPLETED':
        candidateIds.push(event.creatorId);
        if (event.assigneeId) {
          candidateIds.push(event.assigneeId);
        }
        if (event.teamId) {
          const team = await prisma.team.findUnique({
            where: { id: event.teamId },
            select: { ownerId: true },
          });
          if (team?.ownerId) {
            candidateIds.push(team.ownerId);
          }
        }
        break;

      case 'TASK_RETURNED':
        // Creator if still in team, else Team Owner & Admins
        if (event.teamId) {
          const creatorMember = await prisma.teamMember.findUnique({
            where: {
              teamId_userId: { teamId: event.teamId, userId: event.creatorId },
            },
          });
          if (creatorMember) {
            candidateIds.push(event.creatorId);
          } else {
            const team = await prisma.team.findUnique({
              where: { id: event.teamId },
              select: {
                ownerId: true,
                members: {
                  where: { role: 'ADMIN' },
                  select: { userId: true },
                },
              },
            });
            if (team?.ownerId) {
              candidateIds.push(team.ownerId);
            }
            if (team?.members) {
              for (const m of team.members) {
                candidateIds.push(m.userId);
              }
            }
          }
        } else {
          candidateIds.push(event.creatorId);
        }
        break;

      case 'TASK_DEADLINE_CHANGED':
      case 'TASK_DEADLINE_SOON':
      case 'TASK_OVERDUE':
        if (event.assigneeId) {
          candidateIds.push(event.assigneeId);
        } else {
          candidateIds.push(event.creatorId);
        }
        break;

      case 'TASK_DELETED':
        if (event.assigneeId) {
          candidateIds.push(event.assigneeId);
        }
        candidateIds.push(event.creatorId);
        break;

      case 'TASK_MOVED_TEAM':
        if (event.assigneeId) {
          candidateIds.push(event.assigneeId);
        }
        const targetTeam = await prisma.team.findUnique({
          where: { id: event.targetTeamId },
          select: { ownerId: true },
        });
        if (targetTeam?.ownerId) {
          candidateIds.push(targetTeam.ownerId);
        }
        break;

      case 'TEAM_MEMBER_ADDED':
        candidateIds.push(event.newMemberId);
        break;

      case 'TEAM_MEMBER_REMOVED':
        if (event.isSelfLeave) {
          // If member left on their own, notify Team Owner
          const team = await prisma.team.findUnique({
            where: { id: event.teamId },
            select: { ownerId: true },
          });
          if (team?.ownerId) {
            candidateIds.push(team.ownerId);
          }
        } else {
          // If member was removed by Admin/Owner, notify that member
          candidateIds.push(event.removedUserId);
        }
        break;

      case 'TEAM_ROLE_CHANGED':
        candidateIds.push(event.targetUserId);
        break;

      case 'TEAM_OWNERSHIP_TRANSFERRED':
        candidateIds.push(event.newOwnerId);
        candidateIds.push(event.previousOwnerId);
        break;

      case 'TEAM_DELETED':
        // Notify all remaining members
        const members = await prisma.teamMember.findMany({
          where: { teamId: event.teamId },
          select: { userId: true },
        });
        for (const m of members) {
          candidateIds.push(m.userId);
        }
        break;
    }

    // Filter out actor and deduplicate
    let uniqueIds = Array.from(new Set(candidateIds)).filter(
      (id) => id > 0 && id !== event.actorId,
    );

    // Ensure authorization & data synchronization:
    // If this is a team-scoped event, verify candidates still have active access to the team
    if ('teamId' in event && event.teamId) {
      const team = await prisma.team.findUnique({
        where: { id: event.teamId },
        select: {
          ownerId: true,
          members: { select: { userId: true } },
        },
      });

      if (team) {
        const activeMemberIds = new Set([
          team.ownerId,
          ...team.members.map((m) => m.userId),
        ]);

        uniqueIds = uniqueIds.filter((id) => {
          // Allow self-unassignment notice or self-removal notice
          if (event.type === 'TASK_UNASSIGNED' && id === event.previousAssigneeId) {
            return true;
          }
          if (event.type === 'TEAM_MEMBER_REMOVED' && id === event.removedUserId) {
            return true;
          }
          if (event.type === 'TEAM_DELETED') {
            return true;
          }
          return activeMemberIds.has(id);
        });
      }
    }

    if (uniqueIds.length === 0) {
      return [];
    }

    if (prisma.user?.findMany) {
      const existingUsers = await prisma.user.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },
      });
      const validUserIds = new Set(existingUsers.map((u) => u.id));
      return uniqueIds.filter((id) => validUserIds.has(id));
    }

    return uniqueIds;
  }
}
