import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthResponseDto, UserResponseDto } from './dto/auth-response.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản người dùng mới' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Đăng ký thành công và trả về thông tin người dùng cùng JWT token',
    type: AuthResponseDto,
  })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập vào hệ thống để nhận JWT token' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đăng nhập thành công',
    type: AuthResponseDto,
  })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin tài khoản đang đăng nhập' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy thông tin thành công',
    type: UserResponseDto,
  })
  async getProfile(@CurrentUser('id') userId: number): Promise<UserResponseDto> {
    return this.authService.getProfile(userId);
  }
}
