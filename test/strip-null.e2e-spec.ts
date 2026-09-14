import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp } from './utils.e2e';

describe('StripNull (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
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

  it('une annonce sans catégorie → aucune clé null, primitives conservées', async () => {
    const token = await login('e2e.syndic@mysyndic.ci', 'E2eToken!X');

    await request(app.getHttpServer())
      .post('/api/annonces')
      .set('Authorization', `Bearer ${token}`)
      .send({ titre: 'Annonce sans categ', contenu: 'corps' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/annonces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const annonce = res.body[0];
    expect(annonce.titre).toBe('Annonce sans categ');
    expect(annonce.categorie_id).toBeUndefined();
    expect(annonce.categorie_annonce).toBeUndefined();
    expect(annonce.is_deleted).toBe(false);
    expect(annonce.created_at).toBeDefined();
    expect(annonce.deleted_at).toBeUndefined();
  });

  it('aucune valeur primitive null reste dans la chaîne JSON (sans mot "null")', async () => {
    const token = await login('e2e.syndic@mysyndic.ci', 'E2eToken!X');
    await request(app.getHttpServer())
      .post('/api/annonces')
      .set('Authorization', `Bearer ${token}`)
      .send({ titre: 'TTitreClean', contenu: 'corps2' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get('/api/annonces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const raw = JSON.stringify(res.body);
    const stripped = raw.replace(/"titre":"[^"]*"/g, '').replace(/"contenu":"[^"]*"/g, '');
    expect(stripped).not.toContain('null');
  });
});