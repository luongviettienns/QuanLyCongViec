import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TaskModule } from '../tasks/task.module.js';
import { TeamsModule } from '../teams/teams.module.js';
import { AiController } from './ai.controller.js';
import { AiProviderRegistry } from './providers/ai-provider.registry.js';
import { AiActionService } from './services/ai-action.service.js';
import { AiAgentService } from './services/ai-agent.service.js';
import { AiExtendedValidatorService } from './services/ai-extended-validator.service.js';
import { AiTaskValidatorService } from './services/ai-task-validator.service.js';
import { AiTeamValidatorService } from './services/ai-team-validator.service.js';
import { AiToolsService } from './services/ai-tools.service.js';

@Module({
  imports: [
    AuthModule,
    TaskModule,
    TeamsModule,
    CategoriesModule,
    NotificationsModule,
  ],
  controllers: [AiController],
  providers: [
    AiProviderRegistry,
    AiTaskValidatorService,
    AiExtendedValidatorService,
    AiTeamValidatorService,
    AiToolsService,
    AiAgentService,
    AiActionService,
  ],
  exports: [
    AiProviderRegistry,
    AiTaskValidatorService,
    AiExtendedValidatorService,
    AiTeamValidatorService,
    AiAgentService,
    AiActionService,
  ],
})
export class AiModule {}
