import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { McpTokenScope } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  McpTokenService,
  type AuthenticatedMcpUser,
} from '../services/mcp-token.service.js';
import {
  MCP_TOKEN_PREFIX,
  extractBearerToken,
  isPersonalAccessTokenFormat,
} from '../utils/mcp-token.utils.js';

export interface McpAuthenticatedRequest extends Request {
  mcpAuth?: AuthenticatedMcpUser;
}

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: McpTokenService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<McpAuthenticatedRequest>();
    const rawBearer = extractBearerToken(req.headers.authorization);
    if (!rawBearer) {
      throw new UnauthorizedException(
        'Thiếu hoặc sai định dạng header Authorization: Bearer <token>',
      );
    }

    if (rawBearer.startsWith(MCP_TOKEN_PREFIX)) {
      if (!isPersonalAccessTokenFormat(rawBearer)) {
        throw new UnauthorizedException(
          'API token MCP không hợp lệ, đã hết hạn hoặc đã bị thu hồi',
        );
      }
      const authUser = await this.tokenService.validatePersonalAccessToken(rawBearer);
      if (!authUser) {
        throw new UnauthorizedException(
          'API token MCP không hợp lệ, đã hết hạn hoặc đã bị thu hồi',
        );
      }
      req.mcpAuth = authUser;
      return true;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub?: unknown }>(rawBearer);
      if (typeof payload.sub !== 'number' || !Number.isInteger(payload.sub) || payload.sub <= 0) {
        throw new UnauthorizedException('Token xác thực không hợp lệ');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, name: true },
      });
      if (!user) {
        throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc người dùng không tồn tại');
      }

      req.mcpAuth = {
        userId: user.id,
        email: user.email,
        name: user.name,
        authType: 'jwt',
        scope: McpTokenScope.READ,
      };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Token xác thực không hợp lệ hoặc đã hết hạn');
    }
  }
}
