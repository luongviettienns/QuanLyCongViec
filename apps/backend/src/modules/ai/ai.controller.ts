import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SendAiChatDto } from './dto/send-ai-chat.dto.js';
import { AiActionService } from './services/ai-action.service.js';
import { AiAgentService } from './services/ai-agent.service.js';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly aiActionService: AiActionService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Kiểm tra trạng thái cấu hình trợ lý AI' })
  getStatus() {
    return this.aiAgentService.getStatus();
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Lấy danh sách các cuộc trò chuyện AI của người dùng' })
  listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.aiAgentService.listConversations(user.id);
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Tạo một cuộc trò chuyện AI mới' })
  createConversation(@CurrentUser() user: AuthenticatedUser) {
    return this.aiAgentService.createConversation(user.id);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Lấy chi tiết cuộc trò chuyện AI và danh sách tin nhắn' })
  getConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) conversationId: number,
  ) {
    return this.aiAgentService.getConversation(user.id, conversationId);
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Xóa một cuộc trò chuyện AI thuộc sở hữu của người dùng' })
  deleteConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) conversationId: number,
  ) {
    return this.aiAgentService.deleteConversation(user.id, conversationId);
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Gửi tin nhắn chat cho trợ lý AI' })
  chat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendAiChatDto,
  ) {
    return this.aiAgentService.chat(user.id, dto);
  }

  @Post('actions/:actionId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác nhận và thực thi đề xuất hành động AI' })
  confirmAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('actionId', ParseIntPipe) actionId: number,
  ) {
    return this.aiActionService.confirmAction(user.id, actionId);
  }

  @Post('actions/:actionId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hủy bỏ đề xuất hành động AI đang chờ xác nhận' })
  cancelAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('actionId', ParseIntPipe) actionId: number,
  ) {
    return this.aiActionService.cancelAction(user.id, actionId);
  }
}
