import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Lỗi cơ sở dữ liệu nội bộ';
    let error = 'Internal Server Error';

    switch (exception.code) {
      case 'P2002': {
        statusCode = HttpStatus.CONFLICT;
        const target = exception.meta?.target;
        const targetFields = Array.isArray(target) ? target.join(', ') : target;
        message = targetFields
          ? `Dữ liệu '${targetFields}' đã tồn tại hoặc bị trùng lặp`
          : 'Dữ liệu đã tồn tại hoặc bị trùng lặp';
        error = 'Conflict';
        break;
      }

      case 'P2025': {
        statusCode = HttpStatus.NOT_FOUND;
        message = 'Không tìm thấy bản ghi yêu cầu hoặc bản ghi đã bị xóa';
        error = 'Not Found';
        break;
      }

      case 'P2003': {
        statusCode = HttpStatus.CONFLICT;
        message = 'Dữ liệu liên quan không hợp lệ hoặc bị xung đột ràng buộc khóa ngoại';
        error = 'Conflict';
        break;
      }

      default: {
        this.logger.error(`Unhandled Prisma error code: ${exception.code}`, exception.stack);
        break;
      }
    }

    response.status(statusCode).json({
      statusCode,
      message,
      error,
      code: exception.code,
    });
  }
}
