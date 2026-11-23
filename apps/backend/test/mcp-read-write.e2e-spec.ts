import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CustomThrottlerGuard } from '../src/common/index.js';
import { PrismaService } from '../src/database/prisma.service.js';

const EXPECTED_READ_WRITE_TOOLS = [
  'get_my_tasks',
  'list_tasks',
  'get_task_detail',
  'get_task_stats',
  'list_teams',
  'get_team_detail',
  'list_categories',
  'list_notifications',
  'list_trash_tasks',
  'create_task',
  'update_task',
  'delete_task',
  'restore_task',
  'return_task',
  'create_subtask',
  'update_subtask',
  'delete_subtask',
  'add_team_member',
  'update_team_member_role',
  'remove_team_member',
];

async function createMcpClient(baseUrl: string, bearerToken: string) {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/mcp`), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    },
  });
  const client = new Client({
    name: 'taskflow-mcp-rw-e2e',
    version: '1.0.0',
  });
  await client.connect(transport);
  return { client, transport };
}

function parseToolJson(result: unknown): Record<string, unknown> {
  const obj = result as { content?: unknown } | null | undefined;
  const blocks = Array.isArray(obj?.content) ? obj.content : [];
  const first = blocks[0] as { type?: string; text?: string } | undefined;
  expect(first?.type).toBe('text');
  return JSON.parse(first?.text ?? '{}') as Record<string, unknown>;
}

describe('MCP Server READ_WRITE Tools & Scope Isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const runId = Date.now();
  const password = 'Password123!';

  let ownerToken: string;
  let memberId: number;
  let memberToken: string;
  let outsiderToken: string;
  let teamId: number;
  let categoryId: number;

  const createdUserIds: number[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(CustomThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['/', 'health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

    prisma = app.get(PrismaService);
    const passwordHash = await bcrypt.hash(password, 10);

    const createUserAndLogin = async (prefix: string) => {
      const email = `mcp_rw_${prefix}_${runId}@taskflow.test`;
      const user = await prisma.user.create({
        data: { name: `MCP RW ${prefix}`, email, passwordHash },
      });
      createdUserIds.push(user.id);
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);
      return { id: user.id, email, token: loginRes.body.accessToken as string };
    };

    const owner = await createUserAndLogin('owner');
    ownerToken = owner.token;

    const member = await createUserAndLogin('member');
    memberId = member.id;
    memberToken = member.token;

    const outsider = await createUserAndLogin('outsider');
    outsiderToken = outsider.token;

    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `MCP RW Team ${runId}` })
      .expect(201);
    teamId = teamRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: member.email, role: 'MEMBER' })
      .expect(201);

    const catRes = await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `MCP RW Cat ${runId}`, color: '#1677ff', teamId })
      .expect(201);
    categoryId = catRes.body.id;
  });

  afterAll(async () => {
    if (prisma && createdUserIds.length > 0) {
      await prisma.task.deleteMany({
        where: { OR: [{ userId: { in: createdUserIds } }, { teamId }] },
      });
      await prisma.category.deleteMany({
        where: { OR: [{ userId: { in: createdUserIds } }, { teamId }] },
      });
      await prisma.team.deleteMany({ where: { id: teamId } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (app) {
      await app.close();
    }
  });

  it('keeps READ token restricted while READ_WRITE token exposes 20 tools and executes task/subtask/trash lifecycle with RBAC', async () => {
    // 1. Create READ token and verify it does NOT see write tools
    const readPatRes = await request(app.getHttpServer())
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Read Only Key', scope: 'READ' })
      .expect(201);
    expect(readPatRes.body.record.scope).toBe('READ');

    const readConn = await createMcpClient(baseUrl, readPatRes.body.token as string);
    try {
      const toolsList = await readConn.client.listTools();
      expect(toolsList.tools.map((t) => t.name)).not.toContain('create_task');
      expect(toolsList.tools).toHaveLength(8);
    } finally {
      await readConn.transport.close();
      await readConn.client.close();
    }

    // 2. Create READ_WRITE token for owner
    const rwPatRes = await request(app.getHttpServer())
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Cursor Full Access', scope: 'READ_WRITE', expiresInDays: 30 })
      .expect(201);
    expect(rwPatRes.body.record.scope).toBe('READ_WRITE');

    const rwConn = await createMcpClient(baseUrl, rwPatRes.body.token as string);
    let createdTaskId = 0;
    try {
      const toolsList = await rwConn.client.listTools();
      expect(toolsList.tools.map((t) => t.name).sort()).toEqual(
        [...EXPECTED_READ_WRITE_TOOLS].sort(),
      );

      const deleteTool = toolsList.tools.find((t) => t.name === 'delete_task');
      expect(deleteTool?.annotations?.readOnlyHint).toBe(false);
      expect(deleteTool?.annotations?.destructiveHint).toBe(true);

      // 3. create_task via MCP
      const createRes = await rwConn.client.callTool({
        name: 'create_task',
        arguments: {
          title: `MCP Created Task ${runId}`,
          priority: 'HIGH',
          teamId,
          assigneeId: memberId,
          categoryId,
        },
      });
      expect(createRes.isError).not.toBe(true);
      const createPayload = parseToolJson(createRes);
      expect(createPayload.ok).toBe(true);
      expect(createPayload.actionType).toBe('CREATE_TASK');
      createdTaskId = createPayload.executedTaskId as number;
      expect(createdTaskId).toBeGreaterThan(0);

      // 4. create_subtask & update_subtask via MCP
      const subCreateRes = await rwConn.client.callTool({
        name: 'create_subtask',
        arguments: {
          taskId: createdTaskId,
          title: 'MCP Subtask 1',
          assigneeId: memberId,
        },
      });
      expect(subCreateRes.isError).not.toBe(true);
      const subCreatePayload = parseToolJson(subCreateRes);
      const subtasks = (subCreatePayload.task as { subtasks: Array<{ id: number }> }).subtasks;
      const subtaskId = subtasks[0].id;

      await rwConn.client.callTool({
        name: 'update_subtask',
        arguments: { taskId: createdTaskId, subtaskId, status: 'IN_PROGRESS' },
      });
      const subDoneRes = await rwConn.client.callTool({
        name: 'update_subtask',
        arguments: { taskId: createdTaskId, subtaskId, status: 'DONE' },
      });
      expect(subDoneRes.isError).not.toBe(true);

      // 5. update_task to DONE
      const updateRes = await rwConn.client.callTool({
        name: 'update_task',
        arguments: { taskId: createdTaskId, status: 'DONE' },
      });
      expect(updateRes.isError).not.toBe(true);
      expect((parseToolJson(updateRes).task as { status: string }).status).toBe('DONE');

      // 6. delete_task (soft delete) -> list_trash_tasks -> restore_task
      const delRes = await rwConn.client.callTool({
        name: 'delete_task',
        arguments: { taskId: createdTaskId },
      });
      expect(delRes.isError).not.toBe(true);

      const trashRes = await rwConn.client.callTool({
        name: 'list_trash_tasks',
        arguments: { teamId },
      });
      const trashIds = (parseToolJson(trashRes).tasks as Array<{ id: number }>).map((t) => t.id);
      expect(trashIds).toContain(createdTaskId);

      const restoreRes = await rwConn.client.callTool({
        name: 'restore_task',
        arguments: { taskId: createdTaskId },
      });
      expect(restoreRes.isError).not.toBe(true);
    } finally {
      await rwConn.transport.close();
      await rwConn.client.close();
    }

    // 7. RBAC isolation: member & outsider with READ_WRITE tokens cannot delete owner's task
    const memberPatRes = await request(app.getHttpServer())
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Member RW', scope: 'READ_WRITE' })
      .expect(201);
    const outsiderPatRes = await request(app.getHttpServer())
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ name: 'Outsider RW', scope: 'READ_WRITE' })
      .expect(201);

    const memberConn = await createMcpClient(baseUrl, memberPatRes.body.token as string);
    const outsiderConn = await createMcpClient(baseUrl, outsiderPatRes.body.token as string);
    try {
      const memberDel = await memberConn.client.callTool({
        name: 'delete_task',
        arguments: { taskId: createdTaskId },
      });
      expect(memberDel.isError).toBe(true);

      const outsiderUpdate = await outsiderConn.client.callTool({
        name: 'update_task',
        arguments: { taskId: createdTaskId, title: 'Hacked Title' },
      });
      expect(outsiderUpdate.isError).toBe(true);
    } finally {
      await memberConn.transport.close();
      await memberConn.client.close();
      await outsiderConn.transport.close();
      await outsiderConn.client.close();
    }
  });
});
