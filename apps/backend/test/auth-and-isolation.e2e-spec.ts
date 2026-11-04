import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';

describe('Authentication and Data Isolation (e2e)', () => {
  let app: INestApplication<App>;
  const timestamp = Date.now();

  const userACredentials = {
    name: 'User A',
    email: `usera_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  const userBCredentials = {
    name: 'User B',
    email: `userb_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  let tokenA = '';
  let tokenB = '';
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
  });
});
