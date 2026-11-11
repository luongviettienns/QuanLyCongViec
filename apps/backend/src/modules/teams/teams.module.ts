import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';
import { TeamPolicyService } from './policies/team-policy.service.js';
import { TeamMembershipService } from './services/team-membership.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TaskModule } from '../tasks/task.module.js';
import { TeamActivityModule } from '../team-activity/team-activity.module.js';

@Module({
  imports: [AuthModule, NotificationsModule, TaskModule, TeamActivityModule],
  controllers: [TeamsController],
  providers: [TeamsService, TeamPolicyService, TeamMembershipService],
  exports: [TeamsService, TeamPolicyService, TeamMembershipService],
})
export class TeamsModule {}
