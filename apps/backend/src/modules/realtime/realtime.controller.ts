import { Controller, Sse, UseGuards, UnauthorizedException } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { RealtimeService } from './realtime.service.js';

@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Sse('stream')
  @UseGuards(JwtAuthGuard)
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    if (
      typeof user.tokenExp !== 'number' ||
      !Number.isInteger(user.tokenExp) ||
      user.tokenExp * 1000 <= Date.now()
    ) {
      throw new UnauthorizedException(
        'Token kết nối SSE bắt buộc phải có thời hạn hợp lệ (exp) và chưa hết hạn',
      );
    }
    return this.realtimeService.subscribe(user.id, user.tokenExp);
  }
}
