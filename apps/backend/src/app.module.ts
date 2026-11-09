import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { TaskModule } from './modules/tasks/task.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { TeamsModule } from './modules/teams/teams.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'my-nest-backend',
    }),
    DatabaseModule,
    AuthModule,
    RealtimeModule,
    TaskModule,
    CategoriesModule,
    TeamsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
