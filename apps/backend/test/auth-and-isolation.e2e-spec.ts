import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('Authentication and Data Isolation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const timestamp = Date.now();

  const userACredentials = {
    name: 'User A',
    email: `auth_usera_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  const userBCredentials = {
    name: 'User B',
    email: `auth_userb_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  let tokenA = '';
  let tokenB = '';
  let userAId = 0;
  let catAId = 0;
  let catBId = 0;
  let taskAId = 0;
  let taskBId = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Registration & Login Validation', () => {
    it('rejects registration when fields are invalid', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'A',
          email: 'not-an-email',
          password: 'short',
        })
        .expect(400);
    });

    it('successfully registers User A and returns user and token without password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userACredentials)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(userACredentials.email);
      expect(response.body.user.name).toBe(userACredentials.name);
      expect(response.body.user.password).toBeUndefined();

      tokenA = response.body.accessToken;
      userAId = response.body.user.id;
    });

    it('successfully registers User B', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userBCredentials)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      tokenB = response.body.accessToken;
    });

    it('rejects duplicate email registration with 409 Conflict', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(userACredentials)
        .expect(409);
    });

    it('fails login with wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userACredentials.email,
          password: 'WrongPassword123!',
        })
        .expect(401);
    });

    it('fails login with non-existent email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `nonexistent_${timestamp}@taskflow.test`,
          password: 'Password123!',
        })
        .expect(401);
    });

    it('successfully logs in User A with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userACredentials.email,
          password: userACredentials.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body.user.email).toBe(userACredentials.email);
    });
  });

  describe('Profile & JWT Enforcement', () => {
    it('returns profile for valid JWT token on GET /auth/me', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(response.body.email).toBe(userACredentials.email);
      expect(response.body.name).toBe(userACredentials.name);
      expect(response.body.password).toBeUndefined();
    });

    it('rejects GET /auth/me without token with 401', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });

    it('rejects GET /auth/me with invalid token with 401', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid.token.payload')
        .expect(401);
    });

    it('rejects GET /tasks without token with 401', async () => {
      await request(app.getHttpServer())
        .get('/tasks')
        .expect(401);
    });

    it('rejects POST /tasks without token with 401', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .send({ title: 'Unauthorized Task' })
        .expect(401);
    });

    it('rejects GET /categories without token with 401', async () => {
      await request(app.getHttpServer())
        .get('/categories')
        .expect(401);
    });

    it('rejects requests with expired JWT with 401 Unauthorized', async () => {
      const jwtService = app.get(JwtService);
      const expiredToken = jwtService.sign(
        { sub: 9999, email: 'expired@taskflow.test' },
        { expiresIn: '-10s' },
      );

      await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  describe('A/B User Data Isolation', () => {
    it('creates Category A for User A and Category B for User B', async () => {
      const resA = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: `Category A ${timestamp}`, color: '#1890ff' })
        .expect(201);

      catAId = resA.body.id;

      const resB = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: `Category B ${timestamp}`, color: '#52c41a' })
        .expect(201);

      catBId = resB.body.id;

      expect(catAId).toBeDefined();
      expect(catBId).toBeDefined();
    });

    it('P2.1: enforces case-insensitive unique category name per user (409 Conflict)', async () => {
      // Trying lowercase version of Category A:
      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: `category a ${timestamp}`, color: '#1890ff' })
        .expect(409);

      // Direct Prisma insert to verify PostgreSQL unique index on (userId, lower(name))
      await expect(
        prisma.category.create({
          data: {
            name: `CATEGORY A ${timestamp}`,
            userId: userAId,
            color: '#1890ff',
          },
        }),
      ).rejects.toThrow();
    });

    it('isolates categories so User A cannot see User B categories and vice versa', async () => {
      const resA = await request(app.getHttpServer())
        .get('/categories')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const categoryIdsA = resA.body.map((c: { id: number }) => c.id);
      expect(categoryIdsA).toContain(catAId);
      expect(categoryIdsA).not.toContain(catBId);

      const resB = await request(app.getHttpServer())
        .get('/categories')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      const categoryIdsB = resB.body.map((c: { id: number }) => c.id);
      expect(categoryIdsB).toContain(catBId);
      expect(categoryIdsB).not.toContain(catAId);
    });

    it('creates Task A for User A and Task B for User B', async () => {
      const resA = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: `Task A ${timestamp}`,
          description: 'Description A',
          priority: 'HIGH',
          categoryId: catAId,
        })
        .expect(201);

      taskAId = resA.body.id;

      const resB = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          title: `Task B ${timestamp}`,
          description: 'Description B',
          priority: 'LOW',
          categoryId: catBId,
        })
        .expect(201);

      taskBId = resB.body.id;

      expect(taskAId).toBeDefined();
      expect(taskBId).toBeDefined();
    });

    it('isolates tasks so User A cannot see User B tasks and vice versa', async () => {
      const resA = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const taskIdsA = resA.body.map((t: { id: number }) => t.id);
      expect(taskIdsA).toContain(taskAId);
      expect(taskIdsA).not.toContain(taskBId);

      const resB = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      const taskIdsB = resB.body.map((t: { id: number }) => t.id);
      expect(taskIdsB).toContain(taskBId);
      expect(taskIdsB).not.toContain(taskAId);
    });
  });

  describe('Security & Cross-User Rejection', () => {
    it('denies User B from reading User A task via GET /tasks/:id (404)', async () => {
      await request(app.getHttpServer())
        .get(`/tasks/${taskAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('denies User B from updating User A task via PUT /tasks/:id (404)', async () => {
      await request(app.getHttpServer())
        .put(`/tasks/${taskAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ title: 'Hacked Title By User B' })
        .expect(404);
    });

    it('denies User B from deleting User A task via DELETE /tasks/:id (404)', async () => {
      await request(app.getHttpServer())
        .delete(`/tasks/${taskAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('prevents User B from creating a task referencing User A category', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          title: `Hijack Category ${timestamp}`,
          categoryId: catAId,
        })
        .expect(404);
    });

    it('rejects task creation when client injects a userId field', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: `Injected Task ${timestamp}`,
          userId: 9999,
        })
        .expect(400);
    });

    it('denies User B from reading User A category via GET /categories/:id (404)', async () => {
      await request(app.getHttpServer())
        .get(`/categories/${catAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('denies User B from updating User A category via PUT /categories/:id (404)', async () => {
      await request(app.getHttpServer())
        .put(`/categories/${catAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: `Hacked Category ${timestamp}` })
        .expect(404);
    });

    it('denies User B from deleting User A category via DELETE /categories/:id (404)', async () => {
      await request(app.getHttpServer())
        .delete(`/categories/${catAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('P1.3: does not automatically regenerate default categories when user deletes all categories', async () => {
      const tempUserRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `cat_delete_${timestamp}@taskflow.test`,
          name: 'Category Deleter',
          password: 'Password123!',
        })
        .expect(201);

      const tempToken = tempUserRes.body.accessToken;

      // Initially has 3 default categories created during registration
      const initialCats = await request(app.getHttpServer())
        .get('/categories')
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(200);

      expect(initialCats.body.length).toBe(3);

      // Delete all 3 categories
      for (const cat of initialCats.body) {
        await request(app.getHttpServer())
          .delete(`/categories/${cat.id}`)
          .set('Authorization', `Bearer ${tempToken}`)
          .expect(200);
      }

      // GET /categories again -> MUST be empty [] and NOT auto-recreated
      const afterDeleteCats = await request(app.getHttpServer())
        .get('/categories')
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(200);

      expect(afterDeleteCats.body).toEqual([]);
    });

    it('filters tasks by matching title case-insensitively via GET /tasks?search=...', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tasks?search=${encodeURIComponent('task a')}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body.some((t: { id: number; title: string }) => t.id === taskAId)).toBe(true);
    });

    it('does not match tasks when search term only appears in description', async () => {
      const res = await request(app.getHttpServer())
        .get('/tasks?search=Description%20A')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((t: { id: number }) => t.id === taskAId)).toBe(false);
    });

    it('returns empty list when search term does not match any title', async () => {
      const res = await request(app.getHttpServer())
        .get('/tasks?search=NonExistentTaskTitleXYZ999')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('filters tasks by priority via GET /tasks?priority=HIGH', async () => {
      const res = await request(app.getHttpServer())
        .get('/tasks?priority=HIGH')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body.every((t: { priority: string }) => t.priority === 'HIGH')).toBe(true);
    });
  });

  describe('Task Statistics (GET /tasks/stats)', () => {
    it('rejects unauthenticated request to /tasks/stats with 401', async () => {
      await request(app.getHttpServer())
        .get('/tasks/stats')
        .expect(401);
    });

    it('returns aggregated statistics and isolates data per user', async () => {
      const resA = await request(app.getHttpServer())
        .get('/tasks/stats')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(resA.body).toHaveProperty('total');
      expect(resA.body).toHaveProperty('todo');
      expect(resA.body).toHaveProperty('inProgress');
      expect(resA.body).toHaveProperty('done');
      expect(resA.body).toHaveProperty('overdue');
      expect(resA.body).toHaveProperty('dueSoon');
      expect(resA.body).toHaveProperty('completionRate');
      expect(resA.body).toHaveProperty('byPriority');
      expect(resA.body.byPriority).toHaveProperty('low');
      expect(resA.body.byPriority).toHaveProperty('medium');
      expect(resA.body.byPriority).toHaveProperty('high');
      expect(resA.body).toHaveProperty('upcomingDeadlines');
      expect(Array.isArray(resA.body.upcomingDeadlines)).toBe(true);
      expect(resA.body.upcomingDeadlines.length).toBe(7);
      expect(typeof resA.body.total).toBe('number');
      expect(typeof resA.body.completionRate).toBe('number');

      const resB = await request(app.getHttpServer())
        .get('/tasks/stats')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(resB.body).toHaveProperty('total');
      expect(typeof resB.body.total).toBe('number');
    });
  });

  describe('Task Date Management (YYYY-MM-DD)', () => {
    it('creates a task with valid YYYY-MM-DD startDate and dueDate', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: `Date Task ${Date.now()}`,
          startDate: '2026-11-10',
          dueDate: '2026-11-20',
        })
        .expect(201);

      expect(res.body.startDate).toMatch(/^2026-11-10/);
      expect(res.body.dueDate).toMatch(/^2026-11-20/);
    });

    it('rejects task creation with non YYYY-MM-DD date format', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: `Invalid Format Date ${Date.now()}`,
          startDate: '10/11/2026',
        })
        .expect(400);
    });

    it('rejects task creation with invalid calendar date', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: `Invalid Calendar Date ${Date.now()}`,
          startDate: '2026-02-31',
        })
        .expect(400);
    });

    it('rejects task creation when startDate > dueDate', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: `Inverted Date Task ${Date.now()}`,
          startDate: '2026-11-25',
          dueDate: '2026-11-20',
        })
        .expect(400);
    });
  });
});
