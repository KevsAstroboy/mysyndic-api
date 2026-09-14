import { setupTestApp, TEST_USERS } from './utils.e2e';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

describe('Listes de référence (lecture seule, tout profil connecté)', () => {
  let app: INestApplication;
  let token: string;

  const endpoints = [
    '/api/alertes/motifs',
    '/api/alertes/statuts',
    '/api/incidents/categories',
    '/api/annonces/categories',
    '/api/conflits/categories',
    '/api/conflits/statuts',
    '/api/documents/types',
    '/api/notifications/types',
  ];

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: TEST_USERS.habitant.email, password: TEST_USERS.habitant.password })
      .expect(200);
    token = login.body.access_token as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(endpoints)('expose %s en tableau { id, libelle, code }', async (url) => {
    const res = await request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const item of res.body) {
      expect(typeof item.id).toBe('number');
      expect('code' in item).toBe(true);
      expect(item.is_deleted).toBeUndefined();
    }
  });

  it("categorie_incident expose icon_name", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/incidents/categories')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    if (res.body.length > 0) {
      expect('icon_name' in res.body[0]).toBe(true);
    }
  });

  it('type_document expose code + extension', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/documents/types')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    if (res.body.length > 0) {
      expect('extension' in res.body[0]).toBe(true);
    }
  });
});
