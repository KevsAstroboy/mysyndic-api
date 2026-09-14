import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp } from './utils.e2e';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Annonce (e2e)', () => {
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

  it('SYNDIC crée, lit, modifie et supprime une annonce', async () => {
    const token = await login('e2e.syndic@mysyndic.ci', 'E2eToken!X');

    const created = await request(app.getHttpServer())
      .post('/api/annonces')
      .set('Authorization', `Bearer ${token}`)
      .send({ titre: 'Réunion hybride', contenu: 'Réunion jeudi 19h', est_epinglee: true })
      .expect(201);
    expect(created.body.titre).toBe('Réunion hybride');
    expect(created.body.est_epinglee).toBe(true);
    expect(created.body.auteur_id).toBeDefined();

    const list = await request(app.getHttpServer())
      .get('/api/annonces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.length).toBe(1);

    const updated = await request(app.getHttpServer())
      .patch(`/api/annonces/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ titre: 'Réunion annulée' })
      .expect(200);
    expect(updated.body.titre).toBe('Réunion annulée');

    await request(app.getHttpServer())
      .delete(`/api/annonces/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const afterDelete = await request(app.getHttpServer())
      .get('/api/annonces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(afterDelete.body.length).toBe(0);
  });

  it('HABITANT peut lire les annonces mais pas en créer', async () => {
    const syndicToken = await login('e2e.syndic@mysyndic.ci', 'E2eToken!X');
    const habitantToken = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');

    await request(app.getHttpServer())
      .post('/api/annonces')
      .set('Authorization', `Bearer ${syndicToken}`)
      .send({ titre: 'Lecture habitants', contenu: 'contenu' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/annonces')
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);
    expect(list.body.length).toBe(1);

    await request(app.getHttpServer())
      .post('/api/annonces')
      .set('Authorization', `Bearer ${habitantToken}`)
      .send({ titre: 'Interdit', contenu: 'x' })
      .expect(403);
  });
});