import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaService } from '../../database/prisma.service.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'taskflow_super_secret_jwt_key_2026_production_grade_random_seed_987654321',
      signOptions: {
        expiresIn: '7d',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, OptionalJwtAuthGuard, PrismaService],
  exports: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard, PassportModule, JwtModule],
})
export class AuthModule {}
