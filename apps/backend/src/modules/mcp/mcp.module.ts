import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TaskModule } from '../tasks/task.module.js';
import { TeamsModule } from '../teams/teams.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AiModule } from '../ai/ai.module.js';
import { McpTokenService } from './services/mcp-token.service.js';
import { McpServerService } from './services/mcp-server.service.js';
import { McpAuthGuard } from './guards/mcp-auth.guard.js';
import { McpTokensController } from './controllers/mcp-tokens.controller.js';
import { McpController } from './controllers/mcp.controller.js';

@Module({
  imports: [
    AuthModule,
    TaskModule,
    TeamsModule,
    CategoriesModule,
    NotificationsModule,
    AiModule,
  ],
  controllers: [McpTokensController, McpController],
  providers: [McpTokenService, McpServerService, McpAuthGuard],
  exports: [McpTokenService, McpServerService],
})
export class McpModule {}
