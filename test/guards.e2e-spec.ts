import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp, TEST_CITE_ID } from './utils.e2e';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Guards (e2e)', () => {
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

  describe('R3 — must_change_password', () => {
    let counter = 0;
    async function createStaffWithTempPassword() {
      counter++;
      const adminToken = await login('e2e.admin@mysyndic.ci', 'E2eToken!X');
      const email = `e2e.guard${counter}@mysyndic.ci`;
      const res = await request(app.getHttpServer())
        .post('/api/users/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          prenom: 'Guard',
          nom: 'Test',
          email,
          telephone: `+225 07 33 22 ${10 + counter}`,
          profil_code: 'SYNDIC',
        })
        .expect(201);
      return { tempPassword: res.body.temp_password as string, email };
    }

    it('bloque les routes (403) tant que le mdp n est pas changé', async () => {
      const { tempPassword, email } = await createStaffWithTempPassword();
      const token = await login(email, tempPassword);

      await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/villas')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('permet uniquement /auth/change-password', async () => {
      const { tempPassword, email } = await createStaffWithTempPassword();
      const token = await login(email, tempPassword);

      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ old_password: tempPassword, new_password: 'NewP@ss!2026' })
        .expect(200);
      expect(res.body.message).toBeDefined();

      // après changement, accès autorisé
      const newToken = await login(email, 'NewP@ss!2026');
      await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);
    });
  });

  describe('RBAC — cités Super Admin', () => {
    it('SUPER_ADMIN liste toutes les cités', async () => {
      const token = await login('e2e.super@mysyndic.ci', 'E2eToken!X');
      const res = await request(app.getHttpServer())
        .get('/api/cites')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('ADMIN reçoit 403 sur /cites', async () => {
      const token = await login('e2e.admin@mysyndic.ci', 'E2eToken!X');
      await request(app.getHttpServer())
        .get('/api/cites')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('R1 — scoping cité', () => {
    it('ADMIN ne voit que les users de sa cité', async () => {
      const token = await login('e2e.admin@mysyndic.ci', 'E2eToken!X');
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      for (const u of res.body) {
        expect(u.email).not.toBe('e2e.super@mysyndic.ci');
      }
    });
  });
});