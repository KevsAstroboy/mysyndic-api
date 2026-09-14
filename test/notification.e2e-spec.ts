import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp } from './utils.e2e';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Notification (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: email, password })
      .expect(200);
    return res.body.access_token as string;
  }

  async function createNotifFor(userEmail: string, titre: string) {
    const user = await prisma.user.findFirstOrThrow({ where: { email: userEmail } });
    await prisma.notification.create({
      data: {
        cite_id: user.cite_id!,
        user_id: user.id,
        titre,
        message: 'msg',
        lu: false,
      },
    });
  }

  it('badge + liste + marquage lu + read-all', async () => {
    const habitantToken = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');

    await createNotifFor('e2e.habitant@mysyndic.ci', 'Notif 1');
    await createNotifFor('e2e.habitant@mysyndic.ci', 'Notif 2');

    const badge = await request(app.getHttpServer())
      .get('/api/notifications/badge')
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);
    expect(badge.body.count).toBe(2);

    const list = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);
    expect(list.body.length).toBe(2);
    const firstId = list.body[0].id;

    await request(app.getHttpServer())
      .patch(`/api/notifications/${firstId}/lu`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);

    const badgeAfter = await request(app.getHttpServer())
      .get('/api/notifications/badge')
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);
    expect(badgeAfter.body.count).toBe(1);

    await request(app.getHttpServer())
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);

    const badge0 = await request(app.getHttpServer())
      .get('/api/notifications/badge')
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);
    expect(badge0.body.count).toBe(0);
  });

  it('marquer lu la notif d\'un autre → 404', async () => {
    const habitantToken = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');

    await createNotifFor('e2e.syndic@mysyndic.ci', 'Notif syndic');
    const syndicNotif = await prisma.notification.findFirst({
      where: { titre: 'Notif syndic' },
    });
    expect(syndicNotif).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/api/notifications/${syndicNotif!.id}/lu`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(404);
  });
});