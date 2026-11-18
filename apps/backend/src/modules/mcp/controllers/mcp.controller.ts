import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Response } from 'express';
import { McpAuthGuard, type McpAuthenticatedRequest } from '../guards/mcp-auth.guard.js';
import { McpServerService } from '../services/mcp-server.service.js';

@ApiTags('MCP')
@ApiBearerAuth()
@UseGuards(McpAuthGuard)
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpServerService: McpServerService) {}

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @ApiOperation({ summary: 'TaskFlow Read-Only MCP Server (Streamable HTTP JSON-RPC)' })
  async handlePost(@Req() req: McpAuthenticatedRequest, @Res() res: Response): Promise<void> {
    const authUser = req.mcpAuth;
    if (!authUser) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized' },
        id: null,
      });
      return;
    }

    const server = this.mcpServerService.createReadOnlyServer(authUser);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.logger.error(`MCP Streamable HTTP error: ${String(error)}`);
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    } finally {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  }

  @Get()
  @ApiOperation({ summary: 'Stateless MCP server does not open standalone SSE GET streams' })
  handleGet(@Res() res: Response): void {
    res.status(HttpStatus.METHOD_NOT_ALLOWED).setHeader('Allow', 'POST').json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use POST /api/mcp for stateless Streamable HTTP requests.',
      },
      id: null,
    });
  }

  @Delete()
  @ApiOperation({ summary: 'Stateless MCP server has no sessions to terminate' })
  handleDelete(@Res() res: Response): void {
    res.status(HttpStatus.METHOD_NOT_ALLOWED).setHeader('Allow', 'POST').json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Stateless MCP server does not manage sessions.',
      },
      id: null,
    });
  }
}
