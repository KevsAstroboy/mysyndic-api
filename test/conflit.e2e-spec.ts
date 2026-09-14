import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp } from './utils.e2e';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Conflit (e2e)', () => {
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

  it('HABITANT déclare un conflit, le retrouve dans mes-conflits, le syndic le prend en charge', async () => {
    const habitantToken = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');
    const syndicToken = await login('e2e.syndic@mysyndic.ci', 'E2eToken!X');

    const created = await request(app.getHttpServer())
      .post('/api/conflits')
      .set('Authorization', `Bearer ${habitantToken}`)
      .send({ villa_ciblee_num: 'B12', description: 'Bruits après minuit', categorie_id: 1 })
      .expect(201);
    expect(created.body.statut_id).toBe(1);

    const mine = await request(app.getHttpServer())
      .get('/api/conflits/mes-conflits')
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);
    expect(mine.body.length).toBe(1);

    const all = await request(app.getHttpServer())
      .get('/api/conflits')
      .set('Authorization', `Bearer ${syndicToken}`)
      .expect(200);
    expect(all.body.length).toBe(1);

    const pris = await request(app.getHttpServer())
      .patch(`/api/conflits/${created.body.id}/prise-en-charge`)
      .set('Authorization', `Bearer ${syndicToken}`)
      .send({ note_syndic: 'Médiation programmée' })
      .expect(200);
    expect(pris.body.statut_id).toBe(2);
    expect(pris.body.pris_en_charge_at).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/api/conflits/${created.body.id}/prise-en-charge`)
      .set('Authorization', `Bearer ${syndicToken}`)
      .send({})
      .expect(409);
  });

  it('SYNDIC résout un conflit avec note, l\'habitant ne peut pas gérer', async () => {
    const habitantToken = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');
    const syndicToken = await login('e2e.syndic@mysyndic.ci', 'E2eToken!X');

    const created = await request(app.getHttpServer())
      .post('/api/conflits')
      .set('Authorization', `Bearer ${habitantToken}`)
      .send({ villa_ciblee_num: 'C4', description: 'Encombrement du parking' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/conflits/${created.body.id}/resoudre`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .send({ resolution_note: 'x' })
      .expect(403);

    const resolu = await request(app.getHttpServer())
      .patch(`/api/conflits/${created.body.id}/resoudre`)
      .set('Authorization', `Bearer ${syndicToken}`)
      .send({ resolution_note: 'Place attribuée, accord passé.' })
      .expect(200);
    expect(resolu.body.statut_id).toBe(3);
    expect(resolu.body.resolu_at).toBeDefined();

    const note = await request(app.getHttpServer())
      .patch(`/api/conflits/${created.body.id}/note`)
      .set('Authorization', `Bearer ${syndicToken}`)
      .send({ note_syndic: 'Suivi fermé' })
      .expect(200);
    expect(note.body.note_syndic).toBe('Suivi fermé');
  });
});