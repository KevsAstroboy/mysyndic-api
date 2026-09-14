import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp } from './utils.e2e';
import { PrismaService } from '../src/prisma/prisma.service';

describe('User (e2e)', () => {
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

  it('GET /users/me retourne villa courante + cité', async () => {
    const token = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');
    const res = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.villa).toBeDefined();
    expect(res.body.villa.numero).toBe('E2E-1');
    expect(res.body.cite).toBeDefined();
  });

  it('PATCH /users/me met à jour ses infos non sensibles', async () => {
    const token = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');
    const res = await request(app.getHttpServer())
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ prenom: 'E2E-Renommé' })
      .expect(200);
    expect(res.body.prenom).toBe('E2E-Renommé');
  });

  it('POST /users/staff crée un compte must_change_password=true', async () => {
    const adminToken = await login('e2e.admin@mysyndic.ci', 'E2eToken!X');
    const res = await request(app.getHttpServer())
      .post('/api/users/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        prenom: 'Staff',
        nom: 'E2E',
        email: 'e2e.staff@mysyndic.ci',
        telephone: '+225 07 44 55 66',
        profil_code: 'CHEF_SECURITE',
      })
      .expect(201);
    expect(res.body.temp_password).toBeDefined();
    const user = await prisma.user.findFirstOrThrow({
      where: { email: 'e2e.staff@mysyndic.ci' },
    });
    expect(user.must_change_password).toBe(true);
  });

  it('activate/deactivate : compte désactivé refuse login', async () => {
    const adminToken = await login('e2e.admin@mysyndic.ci', 'E2eToken!X');
    const user = await prisma.user.findFirstOrThrow({
      where: { email: 'e2e.habitant@mysyndic.ci' },
    });

    await request(app.getHttpServer())
      .patch(`/api/users/${user.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: 'e2e.habitant@mysyndic.ci', password: 'E2eToken!X' })
      .expect(401);

    await request(app.getHttpServer())
      .patch(`/api/users/${user.id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});