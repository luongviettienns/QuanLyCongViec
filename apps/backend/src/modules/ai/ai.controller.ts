import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { formatMcpErrorMessage } from '../mcp/utils/mcp-serializers.js';
import { SendAiChatDto } from './dto/send-ai-chat.dto.js';
import { AiActionService } from './services/ai-action.service.js';
import { AiAgentService, type AiStreamEvent } from './services/ai-agent.service.js';

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

  @Post('chat/stream')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Gửi tin nhắn chat và nhận phản hồi AI theo thời gian thực (SSE)' })
  async chatStream(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendAiChatDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.aiAgentService.assertCanStartStream(user.id, dto.conversationId);

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const abortController = new AbortController();
    const handleAborted = () => {
      abortController.abort();
    };
    const handleResponseClose = () => {
      if (!res.writableFinished) {
        abortController.abort();
      }
    };

    req.on('aborted', handleAborted);
    res.on('close', handleResponseClose);

    if (
      (req.destroyed && !req.complete) ||
      Boolean(req.socket?.destroyed) ||
      res.closed ||
      res.destroyed
    ) {
      abortController.abort();
    }

    const writeSseEvent = (evt: AiStreamEvent) => {
      if (res.writableEnded || res.destroyed || abortController.signal.aborted) {
        return;
      }
      res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
    };

    try {
      await this.aiAgentService.chatStream(
        user.id,
        dto,
        writeSseEvent,
        abortController.signal,
      );
    } catch (err) {
      if (!res.writableEnded && !res.destroyed && !abortController.signal.aborted) {
        const statusCode =
          err instanceof HttpException
            ? err.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;
        const message =
          err instanceof HttpException
            ? formatMcpErrorMessage(err, 'Đã xảy ra lỗi khi xử lý phản hồi AI')
            : 'Đã xảy ra lỗi khi xử lý phản hồi AI';
        writeSseEvent({
          event: 'error',
          data: { statusCode, message },
        });
      }
    } finally {
      req.off('aborted', handleAborted);
      res.off('close', handleResponseClose);
      if (!res.writableEnded && !res.destroyed) {
        res.end();
      }
    }
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
