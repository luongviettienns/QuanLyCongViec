import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './services/notifications.service.js';
import { NotificationEventService } from './services/notification-event.service.js';
import { NotificationRecipientService } from './services/notification-recipient.service.js';
import { DeadlineReminderService } from './services/deadline-reminder.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationEventService,
    NotificationRecipientService,
    DeadlineReminderService,
  ],
  exports: [
    NotificationsService,
    NotificationEventService,
    NotificationRecipientService,
    DeadlineReminderService,
  ],
})
export class NotificationsModule {}
