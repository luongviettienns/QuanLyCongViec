import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { CreateMcpTokenDto } from '../dto/create-mcp-token.dto.js';
import { McpTokenService } from '../services/mcp-token.service.js';

@ApiTags('MCP')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mcp/tokens')
export class McpTokensController {
  constructor(private readonly tokenService: McpTokenService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách Personal API Token MCP của người dùng' })
  listTokens(@CurrentUser() user: AuthenticatedUser) {
    return this.tokenService.listTokens(user.id);
  }

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  @ApiOperation({ summary: 'Tạo mới Personal API Token chỉ đọc cho MCP Server' })
  createToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMcpTokenDto,
  ) {
    return this.tokenService.createToken(user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Thu hồi Personal API Token MCP' })
  revokeToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) tokenId: number,
  ) {
    return this.tokenService.revokeToken(user.id, tokenId);
  }
}
