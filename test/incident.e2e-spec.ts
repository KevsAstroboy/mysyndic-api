import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp } from './utils.e2e';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Incident (e2e)', () => {
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

  it('HABITANT signale, like puis unlike, et le détail expose les compteurs', async () => {
    const token = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');

    const created = await request(app.getHttpServer())
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({ titre: 'Lampadaire HS', description: 'Éclairage public en panne', categorie_id: 1 })
      .expect(201);
    expect(created.body.description).toBe('Éclairage public en panne');
    expect(created.body.auteur_id).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(`/api/incidents/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.likes_count).toBe(0);
    expect(detail.body.liked_by_me).toBe(false);

    const like = await request(app.getHttpServer())
      .post(`/api/incidents/${created.body.id}/like`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(like.body.liked).toBe(true);

    const afterLike = await request(app.getHttpServer())
      .get(`/api/incidents/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(afterLike.body.likes_count).toBe(1);
    expect(afterLike.body.liked_by_me).toBe(true);

    const unlike = await request(app.getHttpServer())
      .delete(`/api/incidents/${created.body.id}/like`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(unlike.body.liked).toBe(false);

    const list = await request(app.getHttpServer())
      .get('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.length).toBe(1);
  });

  it('commentaires sur 2 niveaux, profondeur 3 rejetée en 400', async () => {
    const token = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');

    const incident = await request(app.getHttpServer())
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Incident pour commentaires' })
      .expect(201);

    const c1 = await request(app.getHttpServer())
      .post(`/api/incidents/${incident.body.id}/commentaires`)
      .set('Authorization', `Bearer ${token}`)
      .send({ texte: 'Je confirme' })
      .expect(201);
    expect(c1.body.niveau).toBe(1);

    const c2 = await request(app.getHttpServer())
      .post(`/api/incidents/${incident.body.id}/commentaires/${c1.body.id}/repondre`)
      .set('Authorization', `Bearer ${token}`)
      .send({ texte: 'Merci' })
      .expect(201);
    expect(c2.body.niveau).toBe(2);

    await request(app.getHttpServer())
      .post(`/api/incidents/${incident.body.id}/commentaires/${c2.body.id}/repondre`)
      .set('Authorization', `Bearer ${token}`)
      .send({ texte: 'Trop profond' })
      .expect(400);

    const detail = await request(app.getHttpServer())
      .get(`/api/incidents/${incident.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.commentaires.length).toBe(1);
    expect(detail.body.commentaires[0].reponses.length).toBe(1);
  });
});