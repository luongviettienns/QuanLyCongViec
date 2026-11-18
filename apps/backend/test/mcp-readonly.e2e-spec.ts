import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { CustomThrottlerGuard } from '../src/common/index.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const EXPECTED_READ_ONLY_TOOLS = [
  'get_my_tasks',
  'list_tasks',
  'get_task_detail',
  'get_task_stats',
  'list_teams',
  'get_team_detail',
  'list_categories',
  'list_notifications',
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
    name: 'taskflow-e2e-test-client',
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

describe('Read-Only MCP Server & Personal Access Tokens (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const runId = Date.now();
  const password = 'Password123!';

  let ownerId: number;
  let ownerToken: string;
  let memberId: number;
  let memberToken: string;
  let outsiderToken: string;

  let teamId: number;
  let categoryId: number;
  let teamTaskId: number;
  let personalTaskId: number;
  let outsiderTaskId: number;

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
      const email = `mcp_${prefix}_${runId}@taskflow.test`;
      const user = await prisma.user.create({
        data: { name: `MCP ${prefix}`, email, passwordHash },
      });
      createdUserIds.push(user.id);
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);
      return { id: user.id, token: loginRes.body.accessToken as string };
    };

    const owner = await createUserAndLogin('owner');
    ownerId = owner.id;
    ownerToken = owner.token;

    const member = await createUserAndLogin('member');
    memberId = member.id;
    memberToken = member.token;

    const outsider = await createUserAndLogin('outsider');
    outsiderToken = outsider.token;

    // Seed team, category, tasks, subtask, and notification
    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `MCP Team ${runId}`, description: 'Read-only MCP test team' })
      .expect(201);
    teamId = teamRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: `mcp_member_${runId}@taskflow.test`, role: 'MEMBER' })
      .expect(201);

    const catRes = await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `MCP Cat ${runId}`, color: '#1677ff', teamId })
      .expect(201);
    categoryId = catRes.body.id;

    const vnToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const teamTaskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `MCP Assigned Task ${runId}`,
        description: 'Task assigned to member with checklist',
        teamId,
        assigneeId: memberId,
        categoryId,
        priority: 'HIGH',
        dueDate: vnToday,
      })
      .expect(201);
    teamTaskId = teamTaskRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/tasks/${teamTaskId}/subtasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Verify read-only MCP checklist', assigneeId: memberId })
      .expect(201);

    const personalTaskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        title: `MCP Personal Task ${runId}`,
        priority: 'MEDIUM',
      })
      .expect(201);
    personalTaskId = personalTaskRes.body.id;

    const outsiderTaskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({
        title: `MCP Outsider Secret Task ${runId}`,
        priority: 'HIGH',
      })
      .expect(201);
    outsiderTaskId = outsiderTaskRes.body.id;
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

  it('rejects unauthenticated and invalid Bearer tokens on /api/mcp and returns 405 on GET/DELETE', async () => {
    await request(app.getHttpServer())
      .post('/api/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/mcp')
      .set('Authorization', 'Bearer tfp_000000000000000000000000000000000000000000000000')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize' })
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/mcp')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(405);

    await request(app.getHttpServer())
      .delete('/api/mcp')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(405);
  });

  it('supports Personal API Token lifecycle (create once, list without hash, authenticate MCP, revoke, cross-user isolation)', async () => {
    // 1. Create PAT for member
    const createRes = await request(app.getHttpServer())
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Cursor Laptop', expiresInDays: 30 })
      .expect(201);

    const rawToken = createRes.body.token as string;
    const tokenRecord = createRes.body.record as {
      id: number;
      name: string;
      tokenPrefix: string;
      scope: string;
      tokenHash?: string;
    };
    expect(rawToken.startsWith('tfp_')).toBe(true);
    expect(tokenRecord.name).toBe('Cursor Laptop');
    expect(tokenRecord.scope).toBe('READ');
    expect(tokenRecord.tokenHash).toBeUndefined();

    // 2. List PATs never returns raw token or tokenHash
    const listRes = await request(app.getHttpServer())
      .get('/api/mcp/tokens')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].tokenHash).toBeUndefined();

    // 3. Outsider cannot revoke member's PAT
    await request(app.getHttpServer())
      .delete(`/api/mcp/tokens/${tokenRecord.id}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    // 4. Connect real MCP Client using member's PAT and inspect all tools, resources, prompts
    const { client, transport } = await createMcpClient(baseUrl, rawToken);
    try {
      const toolsList = await client.listTools();
      const toolNames = toolsList.tools.map((t) => t.name);
      expect(toolNames.sort()).toEqual([...EXPECTED_READ_ONLY_TOOLS].sort());
      for (const tool of toolsList.tools) {
        expect(tool.annotations?.readOnlyHint).toBe(true);
        expect(tool.annotations?.destructiveHint).toBe(false);
      }

      // Call get_my_tasks
      const myTasksRes = await client.callTool({
        name: 'get_my_tasks',
        arguments: { status: 'INCOMPLETE' },
      });
      expect(myTasksRes.isError).not.toBe(true);
      const myTasksPayload = parseToolJson(myTasksRes);
      const myTaskIds = (myTasksPayload.tasks as Array<{ id: number }>).map((t) => t.id);
      expect(myTaskIds).toContain(teamTaskId);
      expect(myTaskIds).toContain(personalTaskId);
      expect(myTaskIds).not.toContain(outsiderTaskId);

      // Call list_tasks with personalOnly=true
      const personalListRes = await client.callTool({
        name: 'list_tasks',
        arguments: { personalOnly: true },
      });
      const personalListPayload = parseToolJson(personalListRes);
      const personalIds = (personalListPayload.tasks as Array<{ id: number }>).map((t) => t.id);
      expect(personalIds).toContain(personalTaskId);
      expect(personalIds).not.toContain(teamTaskId);

      // Call get_task_detail (authorized)
      const detailRes = await client.callTool({
        name: 'get_task_detail',
        arguments: { taskId: teamTaskId },
      });
      expect(detailRes.isError).not.toBe(true);
      const detailPayload = parseToolJson(detailRes);
      const detailTask = detailPayload.task as {
        id: number;
        subtasks: Array<{ title: string }>;
      };
      expect(detailTask.id).toBe(teamTaskId);
      expect(detailTask.subtasks.map((s) => s.title)).toContain('Verify read-only MCP checklist');

      // Call get_task_detail on outsider's task -> RBAC error (isError: true)
      const forbiddenDetailRes = await client.callTool({
        name: 'get_task_detail',
        arguments: { taskId: outsiderTaskId },
      });
      expect(forbiddenDetailRes.isError).toBe(true);

      // Call get_task_stats
      const statsRes = await client.callTool({
        name: 'get_task_stats',
        arguments: { scope: 'my_work' },
      });
      const statsPayload = parseToolJson(statsRes);
      const stats = statsPayload.stats as { total: number; today: number };
      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.today).toBeGreaterThanOrEqual(1);

      // Call list_teams & get_team_detail
      const teamsRes = await client.callTool({ name: 'list_teams', arguments: {} });
      const teamsPayload = parseToolJson(teamsRes);
      expect((teamsPayload.teams as Array<{ id: number }>).map((t) => t.id)).toContain(teamId);

      const teamDetailRes = await client.callTool({
        name: 'get_team_detail',
        arguments: { teamId },
      });
      const teamDetailPayload = parseToolJson(teamDetailRes);
      const teamObj = teamDetailPayload.team as {
        id: number;
        myRole: string;
        members: Array<{ userId: number }>;
      };
      expect(teamObj.id).toBe(teamId);
      expect(teamObj.myRole).toBe('MEMBER');
      expect(teamObj.members.map((m) => m.userId)).toEqual(
        expect.arrayContaining([ownerId, memberId]),
      );

      // Call list_categories (with teamId AND scope='team' without teamId)
      const catsRes = await client.callTool({
        name: 'list_categories',
        arguments: { teamId },
      });
      const catsPayload = parseToolJson(catsRes);
      expect((catsPayload.categories as Array<{ id: number }>).map((c) => c.id)).toContain(
        categoryId,
      );

      const teamScopedCatsRes = await client.callTool({
        name: 'list_categories',
        arguments: { scope: 'team' },
      });
      const teamScopedCats = parseToolJson(teamScopedCatsRes).categories as Array<{
        id: number;
        teamId: number | null;
      }>;
      expect(teamScopedCats.map((c) => c.id)).toContain(categoryId);
      expect(teamScopedCats.every((c) => c.teamId !== null)).toBe(true);

      // Call list_notifications (member got assigned + added to team notifications)
      const notifsRes = await client.callTool({
        name: 'list_notifications',
        arguments: { filter: 'unread', limit: 10 },
      });
      const notifsPayload = parseToolJson(notifsRes);
      expect(typeof notifsPayload.unreadCount).toBe('number');
      expect((notifsPayload.unreadCount as number)).toBeGreaterThanOrEqual(1);

      // Resources list & read
      const resourcesList = await client.listResources();
      const uris = resourcesList.resources.map((r) => r.uri);
      expect(uris).toEqual(
        expect.arrayContaining([
          'taskflow://me/summary',
          'taskflow://tasks/my-work',
          'taskflow://teams',
          'taskflow://notifications/unread',
        ]),
      );

      const summaryResource = await client.readResource({ uri: 'taskflow://me/summary' });
      const summaryContent = summaryResource.contents[0] as { text?: string };
      const parsedSummary = JSON.parse(summaryContent.text ?? '{}') as {
        user: { id: number };
        myWorkStats: { total: number };
      };
      expect(parsedSummary.user.id).toBe(memberId);
      expect(parsedSummary.myWorkStats.total).toBeGreaterThanOrEqual(2);

      // Prompts list & get
      const promptsList = await client.listPrompts();
      expect(promptsList.prompts.map((p) => p.name)).toEqual(
        expect.arrayContaining(['daily_briefing', 'team_workload_overview']),
      );
      const briefingPrompt = await client.getPrompt({ name: 'daily_briefing' });
      expect(briefingPrompt.messages.length).toBeGreaterThanOrEqual(1);
    } finally {
      await transport.close();
      await client.close();
    }

    // 5. Revoke PAT -> subsequent MCP call fails with 401
    await request(app.getHttpServer())
      .delete(`/api/mcp/tokens/${tokenRecord.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/mcp')
      .set('Authorization', `Bearer ${rawToken}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize' })
      .expect(401);
  });

  it('also accepts valid JWT Bearer tokens on /api/mcp and enforces outsider RBAC', async () => {
    const { client, transport } = await createMcpClient(baseUrl, outsiderToken);
    try {
      const teamAttempt = await client.callTool({
        name: 'get_team_detail',
        arguments: { teamId },
      });
      expect(teamAttempt.isError).toBe(true);

      const myTasks = await client.callTool({
        name: 'get_my_tasks',
        arguments: {},
      });
      const payload = parseToolJson(myTasks);
      const ids = (payload.tasks as Array<{ id: number }>).map((t) => t.id);
      expect(ids).toContain(outsiderTaskId);
      expect(ids).not.toContain(teamTaskId);
      expect(ids).not.toContain(personalTaskId);
    } finally {
      await transport.close();
      await client.close();
    }
  });

  it('rejects expired PATs with 401 and enforces the 10-active-token cap per user', async () => {
    // 1. Expired PAT -> 401
    const expCreate = await request(app.getHttpServer())
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Soon Expired', expiresInDays: 7 })
      .expect(201);
    const expiredRaw = expCreate.body.token as string;
    const expiredId = expCreate.body.record.id as number;

    await prisma.personalAccessToken.update({
      where: { id: expiredId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await request(app.getHttpServer())
      .post('/api/mcp')
      .set('Authorization', `Bearer ${expiredRaw}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize' })
      .expect(401);

    // 2. Active token cap (10 active allowed; 11th rejected with 400)
    for (let i = 1; i <= 10; i++) {
      await request(app.getHttpServer())
        .post('/api/mcp/tokens')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `Active Token ${i}` })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Active Token 11' })
      .expect(400);
  });
});
