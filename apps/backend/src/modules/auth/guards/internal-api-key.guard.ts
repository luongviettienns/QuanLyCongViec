import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(InternalApiKeyGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const configuredKey = process.env.INTERNAL_API_KEY;

    // Fail closed if the environment variable is not configured or is whitespace
    if (!configuredKey || configuredKey.trim().length === 0) {
      this.logger.error(
        'Truy cập endpoint nội bộ bị từ chối: biến môi trường INTERNAL_API_KEY chưa được cấu hình (fail-closed).',
      );
      throw new ForbiddenException(
        'Yêu cầu mã xác thực nội bộ hợp lệ để thực hiện tác vụ này',
      );
    }

    const providedKey = request.headers['x-internal-key'];

    if (!providedKey || typeof providedKey !== 'string') {
      throw new ForbiddenException(
        'Yêu cầu mã xác thực nội bộ hợp lệ để thực hiện tác vụ này',
      );
    }

    const providedBuffer = Buffer.from(providedKey);
    const configuredBuffer = Buffer.from(configuredKey);

    // Constant-time comparison to prevent timing attacks
    if (
      providedBuffer.length !== configuredBuffer.length ||
      !timingSafeEqual(providedBuffer, configuredBuffer)
    ) {
      throw new ForbiddenException(
        'Yêu cầu mã xác thực nội bộ hợp lệ để thực hiện tác vụ này',
      );
    }

    return true;
  }
}
