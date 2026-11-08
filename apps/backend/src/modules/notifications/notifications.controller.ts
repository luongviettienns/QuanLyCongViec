import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './services/notifications.service.js';
import { DeadlineReminderService } from './services/deadline-reminder.service.js';
import { QueryNotificationsDto } from './dto/query-notifications.dto.js';
import { MarkBulkReadDto } from './dto/mark-notification-read.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly deadlineReminderService: DeadlineReminderService,
  ) {}

  @ApiOperation({ summary: 'Kích hoạt quét và gửi nhắc nhở deadline' })
  @Post('reminders/trigger')
  triggerDeadlineReminders() {
    return this.deadlineReminderService.checkAndSendReminders();
  }

  @ApiOperation({ summary: 'Lấy danh sách thông báo của người dùng hiện tại' })
  @Get()
  findAll(
    @Query() query: QueryNotificationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.findAllForUser(user.id, query);
  }

  @ApiOperation({ summary: 'Lấy số lượng thông báo chưa đọc' })
  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getUnreadCount(user.id).then((count) => ({
      unreadCount: count,
    }));
  }

  @ApiOperation({ summary: 'Đánh dấu toàn bộ thông báo là đã đọc' })
  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @ApiOperation({ summary: 'Đánh dấu hàng loạt thông báo theo danh sách ID' })
  @Patch('read-bulk')
  markBulkAsRead(
    @Body() body: MarkBulkReadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.markBulkAsRead(user.id, body.ids);
  }

  @ApiOperation({ summary: 'Đánh dấu một thông báo là đã đọc' })
  @Patch(':id/read')
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.markAsRead(user.id, id);
  }
}
