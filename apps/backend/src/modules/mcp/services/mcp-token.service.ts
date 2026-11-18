import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { McpTokenScope } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import { CreateMcpTokenDto } from '../dto/create-mcp-token.dto.js';
import {
  MAX_ACTIVE_MCP_TOKENS_PER_USER,
  computeTokenExpiresAt,
  generatePersonalAccessToken,
  hashPersonalAccessToken,
} from '../utils/mcp-token.utils.js';

export interface McpTokenRecordView {
  id: number;
  name: string;
  tokenPrefix: string;
  scope: McpTokenScope;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface AuthenticatedMcpUser {
  userId: number;
  email: string;
  name: string;
  authType: 'pat' | 'jwt';
  scope: McpTokenScope;
  tokenId?: number;
}

const TOKEN_PUBLIC_SELECT = {
  id: true,
  name: true,
  tokenPrefix: true,
  scope: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class McpTokenService {
  private readonly logger = new Logger(McpTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listTokens(userId: number): Promise<McpTokenRecordView[]> {
    return this.prisma.personalAccessToken.findMany({
      where: { userId },
      select: TOKEN_PUBLIC_SELECT,
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createToken(
    userId: number,
    dto: CreateMcpTokenDto,
  ): Promise<{ token: string; record: McpTokenRecordView }> {
    const trimmedName = dto.name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 60) {
      throw new BadRequestException('Tên token phải từ 2 đến 60 ký tự');
    }

    const now = new Date();
    const { rawToken, tokenPrefix, tokenHash } = generatePersonalAccessToken();
    const expiresAt = computeTokenExpiresAt(dto.expiresInDays, now);

    const record = await this.prisma.$transaction(async (tx) => {
      // Lock the user row to serialize concurrent token creation against MAX_ACTIVE_MCP_TOKENS_PER_USER
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      const activeCount = await tx.personalAccessToken.count({
        where: {
          userId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      });

      if (activeCount >= MAX_ACTIVE_MCP_TOKENS_PER_USER) {
        throw new BadRequestException(
          `Bạn chỉ có thể giữ tối đa ${MAX_ACTIVE_MCP_TOKENS_PER_USER} API token đang hoạt động. Vui lòng thu hồi bớt token cũ.`,
        );
      }

      return tx.personalAccessToken.create({
        data: {
          userId,
          name: trimmedName,
          tokenPrefix,
          tokenHash,
          scope: McpTokenScope.READ,
          expiresAt,
        },
        select: TOKEN_PUBLIC_SELECT,
      });
    });

    return { token: rawToken, record };
  }

  async revokeToken(userId: number, tokenId: number): Promise<McpTokenRecordView> {
    const existing = await this.prisma.personalAccessToken.findUnique({
      where: { id: tokenId },
      select: { id: true, userId: true, revokedAt: true },
    });

    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Không tìm thấy API token');
    }

    if (existing.revokedAt) {
      return this.prisma.personalAccessToken.findUniqueOrThrow({
        where: { id: tokenId },
        select: TOKEN_PUBLIC_SELECT,
      });
    }

    return this.prisma.personalAccessToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
      select: TOKEN_PUBLIC_SELECT,
    });
  }

  async validatePersonalAccessToken(rawToken: string): Promise<AuthenticatedMcpUser | null> {
    const tokenHash = hashPersonalAccessToken(rawToken);
    const tokenRecord = await this.prisma.personalAccessToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        scope: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!tokenRecord || tokenRecord.revokedAt) {
      return null;
    }

    const now = new Date();
    if (tokenRecord.expiresAt && tokenRecord.expiresAt <= now) {
      return null;
    }

    // Touch lastUsedAt at most once per 60s to keep read calls fast
    const shouldTouch =
      !tokenRecord.lastUsedAt || now.getTime() - tokenRecord.lastUsedAt.getTime() > 60_000;
    if (shouldTouch) {
      void this.prisma.personalAccessToken
        .update({
          where: { id: tokenRecord.id },
          data: { lastUsedAt: now },
        })
        .catch((err: unknown) => {
          this.logger.warn(`Failed to update lastUsedAt for MCP token #${tokenRecord.id}: ${String(err)}`);
        });
    }

    return {
      userId: tokenRecord.user.id,
      email: tokenRecord.user.email,
      name: tokenRecord.user.name,
      authType: 'pat',
      scope: tokenRecord.scope,
      tokenId: tokenRecord.id,
    };
  }
}
