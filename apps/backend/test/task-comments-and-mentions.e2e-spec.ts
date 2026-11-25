import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { configureTestApp } from './test-app.helper.js';

describe('Task Comments, @Mentions & 1-Level Replies (E2E)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;
  let ownerId: number;
  let memberAToken: string;
  let memberAId: number;
  let memberBToken: string;
  let memberBId: number;
  let outsiderToken: string;
  let outsiderId: number;
  let teamId: number;
  let teamTaskId: number;
  const runId = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const register = async (prefix: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `${prefix}_${runId}@example.com`,
          name: `${prefix} User`,
          password: 'Password123!',
        })
        .expect(201);
      return {
        token: res.body.accessToken as string,
        id: res.body.user.id as number,
        email: res.body.user.email as string,
      };
    };

    const owner = await register('comment_owner');
    const memberA = await register('comment_member_a');
    const memberB = await register('comment_member_b');
    const outsider = await register('comment_outsider');

    ownerToken = owner.token;
    ownerId = owner.id;
    memberAToken = memberA.token;
    memberAId = memberA.id;
    memberBToken = memberB.token;
    memberBId = memberB.id;
    outsiderToken = outsider.token;
    outsiderId = outsider.id;

    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Comment Team ${runId}` })
      .expect(201);
    teamId = teamRes.body.id as number;

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: memberA.email })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: memberB.email })
      .expect(201);

    const taskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `Comment Task ${runId}`,
        teamId,
        assigneeId: memberAId,
      })
      .expect(201);
    teamTaskId = taskRes.body.id as number;
  });

  afterAll(async () => {
    try {
      await prisma.task.deleteMany({ where: { teamId } });
      await prisma.team.deleteMany({ where: { id: teamId } });
      await prisma.user.deleteMany({
        where: { id: { in: [ownerId, memberAId, memberBId, outsiderId] } },
      });
    } finally {
      await app.close();
    }
  });

  it('creates root comment with validated @mentions, drops outsiders & self, and notifies recipients', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/api/tasks/${teamTaskId}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        content: 'Nhờ @comment_member_a User kiểm tra phần API giúp mình nhé',
        mentionedUserIds: [memberAId, ownerId, outsiderId],
      })
      .expect(201);

    const rootCommentId = createRes.body.id as number;
    expect(rootCommentId).toBeGreaterThan(0);
    expect(createRes.body.parentId).toBeNull();
    expect(createRes.body.mentionedUserIds).toEqual([memberAId]);
    expect(createRes.body.mentions).toEqual([
      { id: memberAId, name: 'comment_member_a User' },
    ]);

    const memberANotifs = await prisma.notification.findMany({
      where: { userId: memberAId, commentId: rootCommentId },
    });
    expect(memberANotifs).toHaveLength(1);
    expect(memberANotifs[0].type).toBe('TASK_COMMENT_MENTIONED');
    expect(memberANotifs[0].taskId).toBe(teamTaskId);

    const outsiderNotifs = await prisma.notification.findMany({
      where: { userId: outsiderId, commentId: rootCommentId },
    });
    expect(outsiderNotifs).toHaveLength(0);

    const selfNotifs = await prisma.notification.findMany({
      where: { userId: ownerId, commentId: rootCommentId },
    });
    expect(selfNotifs).toHaveLength(0);

    const taskDetailRes = await request(app.getHttpServer())
      .get(`/api/tasks/${teamTaskId}`)
      .set('Authorization', `Bearer ${memberAToken}`)
      .expect(200);
    expect(taskDetailRes.body._count?.comments).toBe(1);
  });

  it('flattens nested replies to 1 level and deduplicates reply + @mention notification', async () => {
    const listBefore = await request(app.getHttpServer())
      .get(`/api/tasks/${teamTaskId}/comments`)
      .set('Authorization', `Bearer ${memberAToken}`)
      .expect(200);
    const rootId = listBefore.body[0].id as number;

    // Member A replies to Owner's root comment
    const firstReply = await request(app.getHttpServer())
      .post(`/api/tasks/${teamTaskId}/comments`)
      .set('Authorization', `Bearer ${memberAToken}`)
      .send({
        content: '@comment_owner User Mình đang kiểm tra rồi nhé',
        parentId: rootId,
        mentionedUserIds: [ownerId],
      })
      .expect(201);

    expect(firstReply.body.parentId).toBe(rootId);

    // Owner should receive ONLY 1 notification (TASK_COMMENT_REPLIED), not duplicate mention
    const ownerReplyNotifs = await prisma.notification.findMany({
      where: { userId: ownerId, commentId: firstReply.body.id },
    });
    expect(ownerReplyNotifs).toHaveLength(1);
    expect(ownerReplyNotifs[0].type).toBe('TASK_COMMENT_REPLIED');

    // Member B replies targeting firstReply.id -> backend flattens parentId back to rootId
    // while notifying memberA (author of firstReply) + mentioning ownerId
    const secondReply = await request(app.getHttpServer())
      .post(`/api/tasks/${teamTaskId}/comments`)
      .set('Authorization', `Bearer ${memberBToken}`)
      .send({
        content: '@comment_member_a User @comment_owner User Mình xác nhận đã pass',
        parentId: firstReply.body.id,
        mentionedUserIds: [memberAId, ownerId],
      })
      .expect(201);

    expect(secondReply.body.parentId).toBe(rootId);

    const memberANotifs = await prisma.notification.findMany({
      where: { userId: memberAId, commentId: secondReply.body.id },
    });
    expect(memberANotifs).toHaveLength(1);
    expect(memberANotifs[0].type).toBe('TASK_COMMENT_REPLIED');

    const ownerMentionNotifs = await prisma.notification.findMany({
      where: { userId: ownerId, commentId: secondReply.body.id },
    });
    expect(ownerMentionNotifs).toHaveLength(1);
    expect(ownerMentionNotifs[0].type).toBe('TASK_COMMENT_MENTIONED');

    const threadRes = await request(app.getHttpServer())
      .get(`/api/tasks/${teamTaskId}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(threadRes.body).toHaveLength(1);
    expect(threadRes.body[0].replies).toHaveLength(2);
    expect(threadRes.body[0].replies.map((r: { id: number }) => r.id)).toEqual([
      firstReply.body.id,
      secondReply.body.id,
    ]);
  });

  it('enforces access isolation, author-only edit, and owner/admin moderation delete', async () => {
    // Outsider cannot read or post comments
    await request(app.getHttpServer())
      .get(`/api/tasks/${teamTaskId}/comments`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/tasks/${teamTaskId}/comments`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ content: 'Spam' })
      .expect(404);

    const threadRes = await request(app.getHttpServer())
      .get(`/api/tasks/${teamTaskId}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const rootComment = threadRes.body[0];
    const memberAReply = rootComment.replies[0];

    // Owner cannot edit Member A's reply (author-only)
    await request(app.getHttpServer())
      .patch(`/api/tasks/${teamTaskId}/comments/${memberAReply.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: 'Sửa hộ' })
      .expect(403);

    // Member A edits their own reply
    const editedRes = await request(app.getHttpServer())
      .patch(`/api/tasks/${teamTaskId}/comments/${memberAReply.id}`)
      .set('Authorization', `Bearer ${memberAToken}`)
      .send({
        content: '@comment_member_b User Đã cập nhật kết quả kiểm tra',
        mentionedUserIds: [memberBId],
      })
      .expect(200);
    expect(editedRes.body.content).toContain('Đã cập nhật kết quả kiểm tra');

    const memberBNewMention = await prisma.notification.findMany({
      where: { userId: memberBId, commentId: memberAReply.id },
    });
    expect(memberBNewMention).toHaveLength(1);
    expect(memberBNewMention[0].type).toBe('TASK_COMMENT_MENTIONED');

    // Member B cannot delete Member A's reply
    await request(app.getHttpServer())
      .delete(`/api/tasks/${teamTaskId}/comments/${memberAReply.id}`)
      .set('Authorization', `Bearer ${memberBToken}`)
      .expect(403);

    // Team owner can delete root comment -> cascades replies cleanly while preserving notification rows
    await request(app.getHttpServer())
      .delete(`/api/tasks/${teamTaskId}/comments/${rootComment.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const afterDeleteRes = await request(app.getHttpServer())
      .get(`/api/tasks/${teamTaskId}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(afterDeleteRes.body).toEqual([]);
  });
});
