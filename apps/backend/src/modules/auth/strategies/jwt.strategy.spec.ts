import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let mockPrisma: any;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-strategy-spec';
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
      },
    };
    strategy = new JwtStrategy(mockPrisma);
  });

  describe('JWT Extraction Scoping', () => {
    it('extracts token from Authorization: Bearer header on any endpoint', () => {
      const extractor = (strategy as any)._jwtFromRequest;
      const req = {
        headers: {
          authorization: 'Bearer token-from-header',
        },
        url: '/tasks',
      };
      expect(extractor(req)).toBe('token-from-header');
    });

    it('rejects token in query parameter for all endpoints including /realtime/stream', () => {
      const extractor = (strategy as any)._jwtFromRequest;
      const streamReq1 = {
        headers: {},
        url: '/realtime/stream?token=stream-token-123',
        query: { token: 'stream-token-123' },
      };
      expect(extractor(streamReq1)).toBeNull();

      const streamReq2 = {
        headers: {},
        baseUrl: '/api',
        path: '/realtime/stream',
        query: { token: 'stream-token-456' },
      };
      expect(extractor(streamReq2)).toBeNull();
    });

    it('rejects token in query parameter for standard REST endpoints (/tasks, /categories, /teams)', () => {
      const extractor = (strategy as any)._jwtFromRequest;
      
      const tasksReq = {
        headers: {},
        url: '/tasks?token=leaked-token',
        path: '/tasks',
        query: { token: 'leaked-token' },
      };
      expect(extractor(tasksReq)).toBeNull();

      const categoriesReq = {
        headers: {},
        url: '/categories?token=leaked-token',
        path: '/categories',
        query: { token: 'leaked-token' },
      };
      expect(extractor(categoriesReq)).toBeNull();

      const teamsReq = {
        headers: {},
        url: '/teams?token=leaked-token',
        path: '/teams',
        query: { token: 'leaked-token' },
      };
      expect(extractor(teamsReq)).toBeNull();
    });
  });

  describe('validate', () => {
    it('returns sanitized user object when user exists in database', async () => {
      const mockUser = {
        id: 42,
        email: 'user@example.com',
        name: 'Test User',
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await strategy.validate({ sub: 42, email: 'user@example.com' });
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 42 },
        select: { id: true, email: true, name: true },
      });
      expect(result).toEqual({ ...mockUser, tokenExp: undefined });
    });

    it('attaches tokenExp when exp claim is present in JWT payload', async () => {
      const mockUser = {
        id: 42,
        email: 'user@example.com',
        name: 'Test User',
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await strategy.validate({ sub: 42, email: 'user@example.com', exp: 1770000000 });
      expect(result).toEqual({ ...mockUser, tokenExp: 1770000000 });
    });

    it('throws UnauthorizedException when user does not exist in database', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        strategy.validate({ sub: 999, email: 'ghost@example.com' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('constructor', () => {
    it('throws error when JWT_SECRET is not configured', () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      try {
        expect(() => new JwtStrategy(mockPrisma)).toThrow(
          'JWT_SECRET environment variable is required',
        );
      } finally {
        process.env.JWT_SECRET = originalSecret;
      }
    });
  });
});
