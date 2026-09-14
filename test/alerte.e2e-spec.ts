import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp } from './utils.e2e';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Alerte (e2e)', () => {
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

  it('HABITANT crée une alerte, elle apparaît dans les actives', async () => {
    const token = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');

    const created = await request(app.getHttpServer())
      .post('/api/alertes')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Portail nord forcé', motif_id: 1 })
      .expect(201);
    expect(created.body.statut_id).toBe(10);
    expect(created.body.escalade).toBe(false);

    const syndicToken = await login('e2e.syndic@mysyndic.ci', 'E2eToken!X');
    const actives = await request(app.getHttpServer())
      .get('/api/alertes/actives')
      .set('Authorization', `Bearer ${syndicToken}`)
      .expect(200);
    expect(actives.body.length).toBe(1);
    expect(actives.body[0].id).toBe(created.body.id);

    const historique = await request(app.getHttpServer())
      .get('/api/alertes/historique')
      .set('Authorization', `Bearer ${syndicToken}`)
      .expect(200);
    expect(historique.body.length).toBe(1);
  });

  it('CHEF_SECURITE change le statut puis résout ; disparaît des actives', async () => {
    const habitantToken = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');
    const chefToken = await login('e2e.chef@mysyndic.ci', 'E2eToken!X');

    const created = await request(app.getHttpServer())
      .post('/api/alertes')
      .set('Authorization', `Bearer ${habitantToken}`)
      .send({ description: 'Malaise médical' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/alertes/${created.body.id}/statut`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send({ statut_id: 12, escalade: true })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/alertes/${created.body.id}`)
      .set('Authorization', `Bearer ${chefToken}`)
      .expect(200);
    expect(detail.body.statut_id).toBe(12);
    expect(detail.body.escalade).toBe(true);
    expect(detail.body.escalade_at).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/api/alertes/${created.body.id}/resoudre`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send({ description: 'Agent sur place, personne prise en charge' })
      .expect(200);

    const actives = await request(app.getHttpServer())
      .get('/api/alertes/actives')
      .set('Authorization', `Bearer ${chefToken}`)
      .expect(200);
    expect(actives.body.some((a: any) => a.id === created.body.id)).toBe(false);

    const historique = await request(app.getHttpServer())
      .get('/api/alertes/historique')
      .set('Authorization', `Bearer ${chefToken}`)
      .expect(200);
    expect(historique.body.some((a: any) => a.id === created.body.id)).toBe(true);
  });

  it('SYNDIC sans ALERTE_UPDATE_STATUT reçoit 403 sur changement de statut', async () => {
    const habitantToken = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');
    const syndicToken = await login('e2e.syndic@mysyndic.ci', 'E2eToken!X');

    const created = await request(app.getHttpServer())
      .post('/api/alertes')
      .set('Authorization', `Bearer ${habitantToken}`)
      .send({ description: 'Alerte test 403' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/alertes/${created.body.id}/statut`)
      .set('Authorization', `Bearer ${syndicToken}`)
      .send({ statut_id: 11 })
      .expect(403);
  });
});