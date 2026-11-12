import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { configureTestApp } from './test-app.helper.js';

/**
 * Regression suite for input-validation edge cases that only show up with
 * null / empty-body / whitespace-only / non-positive-id payloads.
 */
describe('Input validation edge cases (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const ts = Date.now();

  let tokenOwner = '';
  let ownerId = 0;
  let memberId = 0;
  let teamId = 0;
  let personalTaskId = 0;
  let teamTaskId = 0;
  let categoryId = 0;

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokenOwner}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureTestApp(moduleFixture.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    const owner = await http()
      .post('/api/auth/register')
      .send({ email: `iv_owner_${ts}@test.local`, name: 'IV Owner', password: 'StrongPass123!' })
      .expect(201);
    tokenOwner = owner.body.accessToken;
    ownerId = owner.body.user.id;

    const member = await http()
      .post('/api/auth/register')
      .send({ email: `iv_member_${ts}@test.local`, name: 'IV Member', password: 'StrongPass123!' })
      .expect(201);
    memberId = member.body.user.id;

    const team = await auth(http().post('/api/teams')).send({ name: `IV Team ${ts}` }).expect(201);
    teamId = team.body.id;
    await auth(http().post(`/api/teams/${teamId}/members`))
      .send({ email: `iv_member_${ts}@test.local`, role: 'MEMBER' })
      .expect(201);

    const personal = await auth(http().post('/api/tasks')).send({ title: `IV personal ${ts}` }).expect(201);
    personalTaskId = personal.body.id;

    const teamTask = await auth(http().post('/api/tasks'))
      .send({ title: `IV team task ${ts}`, teamId, assigneeId: memberId })
      .expect(201);
    teamTaskId = teamTask.body.id;

    const cat = await auth(http().post('/api/categories'))
      .send({ name: `IV Cat ${ts}`, color: '#1890ff' })
      .expect(201);
    categoryId = cat.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('P1.1 - null on non-nullable task fields must be 400, never 500', () => {
    it.each([
      ['PATCH /tasks/:id', 'patch', { title: null }],
      ['PUT /tasks/:id', 'put', { title: null }],
      ['PUT /tasks/:id priority', 'put', { priority: null }],
      ['PATCH /tasks/:id priority', 'patch', { priority: null }],
      ['PUT /tasks/:id status', 'put', { status: null }],
    ] as const)('%s with %j -> 400', async (_label, method, body) => {
      const res = await auth(http()[method](`/api/tasks/${personalTaskId}`)).send(body);
      expect(res.status).toBe(400);
    });

    it('nullable fields still accept null (description, dates, category)', async () => {
      const res = await auth(http().patch(`/api/tasks/${personalTaskId}`)).send({
        description: null,
        startDate: null,
        dueDate: null,
        categoryId: null,
      });
      expect(res.status).toBe(200);
    });

    it('PUT /categories/:id with name:null or color:null -> 400', async () => {
      await auth(http().put(`/api/categories/${categoryId}`)).send({ name: null }).expect(400);
      await auth(http().put(`/api/categories/${categoryId}`)).send({ color: null }).expect(400);
    });
  });

  describe('P1.2 - assignee endpoint: {} is not an unassign request', () => {
    it('PATCH /tasks/:id/assignee with {} -> 400 and assignee is preserved', async () => {
      await auth(http().patch(`/api/tasks/${teamTaskId}/assignee`)).send({}).expect(400);
      const task = await prisma.task.findUnique({ where: { id: teamTaskId } });
      expect(task?.assigneeId).toBe(memberId);
    });

    it('PUT /tasks/:id with only unrelated content never touches the assignee', async () => {
      await auth(http().put(`/api/tasks/${teamTaskId}`)).send({ priority: 'HIGH' }).expect(200);
      const task = await prisma.task.findUnique({ where: { id: teamTaskId } });
      expect(task?.assigneeId).toBe(memberId);
    });

    it('PATCH /tasks/:id/assignee with {assigneeId:null} explicitly unassigns', async () => {
      await auth(http().patch(`/api/tasks/${teamTaskId}/assignee`)).send({ assigneeId: null }).expect(200);
      const task = await prisma.task.findUnique({ where: { id: teamTaskId } });
      expect(task?.assigneeId).toBeNull();
    });
  });

  describe('P1.3 - whitespace-only team name must be rejected', () => {
    it('POST /teams with spaces-only name -> 400', async () => {
      await auth(http().post('/api/teams')).send({ name: '     ' }).expect(400);
    });

    it('POST /teams trims surrounding whitespace before persisting', async () => {
      const res = await auth(http().post('/api/teams')).send({ name: `  Trim Team ${ts}  ` }).expect(201);
      expect(res.body.name).toBe(`Trim Team ${ts}`);
    });

    it('POST /teams whose trimmed name is shorter than 2 chars -> 400', async () => {
      await auth(http().post('/api/teams')).send({ name: '  a  ' }).expect(400);
    });

    it('PATCH /teams/:id with spaces-only name -> 400 and name unchanged', async () => {
      await auth(http().patch(`/api/teams/${teamId}`)).send({ name: '     ' }).expect(400);
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      expect(team?.name).toBe(`IV Team ${ts}`);
    });
  });

  describe('P2.6 - ids must be positive integers', () => {
    it.each([0, -1])('PATCH /tasks/reorder with taskIds [%i] -> 400', async (badId) => {
      await auth(http().patch('/api/tasks/reorder')).send({ taskIds: [badId] }).expect(400);
    });

    it.each([0, -1])('PATCH /teams/:id/transfer-ownership newOwnerId %i -> 400', async (badId) => {
      await auth(http().patch(`/api/teams/${teamId}/transfer-ownership`)).send({ newOwnerId: badId }).expect(400);
    });

    it.each([0, -1])('POST /tasks with categoryId/teamId/assigneeId %i -> 400', async (badId) => {
      await auth(http().post('/api/tasks')).send({ title: `IV bad ${badId}`, categoryId: badId }).expect(400);
      await auth(http().post('/api/tasks')).send({ title: `IV bad ${badId}`, teamId: badId }).expect(400);
      await auth(http().post('/api/tasks')).send({ title: `IV bad ${badId}`, assigneeId: badId }).expect(400);
    });

    it('PATCH /tasks/:id/assignee and /team with 0 -> 400', async () => {
      await auth(http().patch(`/api/tasks/${teamTaskId}/assignee`)).send({ assigneeId: 0 }).expect(400);
      await auth(http().patch(`/api/tasks/${teamTaskId}/team`)).send({ teamId: 0 }).expect(400);
      await auth(http().patch(`/api/tasks/${teamTaskId}/team`)).send({ assigneeId: -5 }).expect(400);
    });

    it('PUT /tasks/:id with teamId/categoryId/assigneeId 0 -> 400', async () => {
      await auth(http().put(`/api/tasks/${personalTaskId}`)).send({ categoryId: 0 }).expect(400);
      await auth(http().put(`/api/tasks/${personalTaskId}`)).send({ teamId: 0 }).expect(400);
      await auth(http().put(`/api/tasks/${personalTaskId}`)).send({ assigneeId: 0 }).expect(400);
    });

    it('GET /tasks?categoryId=0 and teamId=-1 -> 400', async () => {
      await auth(http().get('/api/tasks?categoryId=0')).expect(400);
      await auth(http().get('/api/tasks?teamId=-1')).expect(400);
    });

    it('owner id is still valid sanity check', () => {
      expect(ownerId).toBeGreaterThan(0);
    });
  });
});
