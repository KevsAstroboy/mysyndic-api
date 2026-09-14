import { setupTestApp, TEST_CITE_ID, TEST_VILLA_ID, TEST_USERS } from './utils.e2e';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import * as request from 'supertest';

async function login(app: INestApplication, email: string, password: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ identifier: email, password })
    .expect(200);
  return res.body.access_token as string;
}

describe('Dashboard summary + GET /paiements/:id', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let paiementId: string;

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    const p = await prisma.paiement.create({
      data: {
        cite_id: TEST_CITE_ID,
        villa_id: TEST_VILLA_ID,
        saisi_par: null,
        mois: '2026-09',
        montant: 25000,
        created_at: new Date(),
      },
    });
    paiementId = p.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /dashboard/summary (syndic) expose KPIs de la cité', async () => {
    const token = await login(app, TEST_USERS.syndic.email, TEST_USERS.syndic.password);
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(typeof res.body.habitants).toBe('number');
    expect(typeof res.body.occupants_confirmes).toBe('number');
    expect(typeof res.body.villas.total).toBe('number');
    expect(Array.isArray(res.body.recouvrement)).toBe(true);
    expect(Array.isArray(res.body.impayes)).toBe(true);
  });

  it('GET /dashboard/summary refusé pour un HABITANT', async () => {
    const token = await login(app, TEST_USERS.habitant.email, TEST_USERS.habitant.password);
    await request(app.getHttpServer())
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('GET /paiements/:id renvoie le détail (statut + villa)', async () => {
    const token = await login(app, TEST_USERS.syndic.email, TEST_USERS.syndic.password);
    const res = await request(app.getHttpServer())
      .get(`/api/paiements/${paiementId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.id).toBe(paiementId);
    expect(res.body.villa).toBeDefined();
    expect(res.body.cite_id).toBe(TEST_CITE_ID);
  });

  it('GET /paiements/:id 404 si introuvable', async () => {
    const token = await login(app, TEST_USERS.syndic.email, TEST_USERS.syndic.password);
    await request(app.getHttpServer())
      .get('/api/paiements/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
