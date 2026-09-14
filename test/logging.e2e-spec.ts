import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp } from './utils.e2e';

describe('Logging (e2e)', () => {
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

  it('les réponses portent le header X-Request-Id', async () => {
    const token = await login('e2e.syndic@mysyndic.ci', 'E2eToken!X');
    const res = await request(app.getHttpServer())
      .get('/api/annonces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('une erreur 400 contient requestId dans le body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: 'inconnu@x.ci', password: 'y' })
      .expect(401);
    expect(res.body.requestId).toBeDefined();
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('une erreur 404 conserve la forme JSON existante + requestId', async () => {
    const token = await login('e2e.syndic@mysyndic.ci', 'E2eToken!X');
    const res = await request(app.getHttpServer())
      .get('/api/annonces/00000000-0000-0000-0000-00000000ffff')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(res.body.message).toBeDefined();
    expect(res.body.statusCode).toBe(404);
    expect(typeof res.body.requestId).toBe('string');
  });
});