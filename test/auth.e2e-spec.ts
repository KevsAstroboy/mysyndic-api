import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp, TEST_CITE_ID } from './utils.e2e';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
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

  describe('POST /auth/login', () => {
    it('retourne 200 + tokens pour admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: 'e2e.admin@mysyndic.ci', password: 'E2eToken!X' })
        .expect(200);
      expect(res.body.access_token).toBeDefined();
      expect(res.body.refresh_token).toBeDefined();
      expect(res.body.user.email).toBe('e2e.admin@mysyndic.ci');
      const payload = JSON.parse(
        Buffer.from(res.body.access_token.split('.')[1], 'base64').toString(),
      );
      expect(payload.cite_id).toBe(TEST_CITE_ID);
      expect(payload.role).toBe('ADMIN');
      expect(payload.must_change_password).toBe(false);
    });

    it('retourne 401 pour mauvais mdp', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: 'e2e.admin@mysyndic.ci', password: 'wrong' })
        .expect(401);
    });

    it('retourne 401 pour email inconnu', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: 'nobody@mysyndic.ci', password: 'xxx' })
        .expect(401);
    });
  });
describe('POST /auth/register + activation', () => {
    it('crée habitant inactif + villa + groupe + OTP', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          prenom: 'Nouveau',
          nom: 'Habitant',
          email: 'e2e.new@mysyndic.ci',
          telephone: '+225 07 11 22 33',
          password: 'Str0ngP@ss!999',
          villa_id: '00000000-0000-0000-AAAA-000000000004',
        })
        .expect(201);
      expect(res.body.access_token).toBeUndefined();
      expect(res.body.requires_activation).toBe(true);
      expect(res.body.user_id).toBeDefined();
      expect(res.body.email).toBe('e2e.new@mysyndic.ci');

      const created = await prisma.user.findFirstOrThrow({
        where: { email: 'e2e.new@mysyndic.ci' },
      });
      expect(created.is_active).toBe(false);

      const villa = await prisma.user_villa.findFirstOrThrow({
        where: { user_id: created.id, is_current: true },
      });
      expect(villa.villa_id!.toLowerCase()).toBe(
        '00000000-0000-0000-AAAA-000000000004'.toLowerCase(),
      );
      const membre = await prisma.groupe_cite_membre.count({
        where: { user_id: created.id },
      });
      expect(membre).toBeGreaterThan(0);
      const otp = await prisma.otp.findFirstOrThrow({
        where: { user_id: created.id, contexte: 'ACCOUNT_ACTIVATION' },
      });
      expect(otp.email_dest).toBe('e2e.new@mysyndic.ci');
    });

    it('active le compte avec le bon code puis renvoie les tokens', async () => {
      const created = await prisma.user.findFirstOrThrow({
        where: { email: 'e2e.new@mysyndic.ci' },
      });
      expect(created.is_active).toBe(false);

      const otp = await prisma.otp.findFirstOrThrow({
        where: { user_id: created.id, contexte: 'ACCOUNT_ACTIVATION', is_used: false },
        orderBy: { created_at: 'desc' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/activate')
        .send({ email: 'e2e.new@mysyndic.ci', otp_code: otp.code })
        .expect(200);
      expect(res.body.access_token).toBeDefined();
      expect(res.body.refresh_token).toBeDefined();
      expect(res.body.user.email).toBe('e2e.new@mysyndic.ci');

      const after = await prisma.user.findFirstOrThrow({
        where: { email: 'e2e.new@mysyndic.ci' },
      });
      expect(after.is_active).toBe(true);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: 'e2e.new@mysyndic.ci', password: 'Str0ngP@ss!999' })
        .expect(200);
    });

    it('rejette un mauvais code', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          prenom: 'Mauvais',
          nom: 'Code',
          email: 'e2e.badcode@mysyndic.ci',
          password: 'Str0ngP@ss!888',
          villa_id: '00000000-0000-0000-AAAA-000000000004',
        })
        .expect(201);
      const created = await prisma.user.findFirstOrThrow({
        where: { email: 'e2e.badcode@mysyndic.ci' },
      });
      const otp = await prisma.otp.findFirstOrThrow({
        where: { user_id: created.id, contexte: 'ACCOUNT_ACTIVATION', is_used: false },
        orderBy: { created_at: 'desc' },
      });
      await request(app.getHttpServer())
        .post('/api/auth/activate')
        .send({ email: 'e2e.badcode@mysyndic.ci', otp_code: '000000' })
        .expect(400);
      const after = await prisma.otp.findUniqueOrThrow({ where: { id: otp.id } });
      expect(after.attempts_count).toBeGreaterThan(0);
    });

    it('rejette le renvoi si le compte est déjà activé', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/activate/resend')
        .send({ email: 'e2e.new@mysyndic.ci' })
        .expect(400);
    });

    it('retourne 409 pour email existant', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          prenom: 'Dup',
          nom: 'Habitant',
          email: 'e2e.admin@mysyndic.ci',
          password: 'Str0ngP@ss!999',
          villa_id: '00000000-0000-0000-AAAA-000000000004',
        })
        .expect(409);
    });

    it('réactive un compte soft-deleted au lieu de 409', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          prenom: 'Ex',
          nom: 'Supprimé',
          email: 'e2e.reactivate@mysyndic.ci',
          password: 'Str0ngP@ss!777',
          villa_id: '00000000-0000-0000-AAAA-000000000004',
        })
        .expect(201);
      const created = await prisma.user.findFirstOrThrow({
        where: { email: 'e2e.reactivate@mysyndic.ci' },
      });
      const userId = created.id;

      await prisma.user.update({
        where: { id: userId },
        data: { is_deleted: true, deleted_at: new Date() },
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          prenom: 'Ex',
          nom: 'Réactivé',
          email: 'e2e.reactivate@mysyndic.ci',
          password: 'Str0ngP@ss!777',
          villa_id: '00000000-0000-0000-AAAA-000000000004',
        })
        .expect(201);
      expect(res.body.requires_activation).toBe(true);
      expect(res.body.user_id).toBe(userId);

      const after = await prisma.user.findFirstOrThrow({
        where: { email: 'e2e.reactivate@mysyndic.ci' },
      });
      expect(after.id).toBe(userId);
      expect(after.is_deleted).toBe(false);
      expect(after.is_active).toBe(false);
      expect(after.nom).toBe('Réactivé');

      const otp = await prisma.otp.findFirstOrThrow({
        where: { user_id: userId, contexte: 'ACCOUNT_ACTIVATION', is_used: false },
        orderBy: { created_at: 'desc' },
      });
      const activated = await request(app.getHttpServer())
        .post('/api/auth/activate')
        .send({ email: 'e2e.reactivate@mysyndic.ci', otp_code: otp.code })
        .expect(200);
      expect(activated.body.access_token).toBeDefined();
    });

    it('retourne 400 pour villa invalide', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          prenom: 'Dup',
          nom: 'Habitant',
          email: 'e2e.badvilla@mysyndic.ci',
          password: 'Str0ngP@ss!999',
          villa_id: '00000000-0000-0000-0000-000000000000',
        })
        .expect(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('renouvelle les tokens', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: 'e2e.admin@mysyndic.ci', password: 'E2eToken!X' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: login.body.refresh_token })
        .expect(200);
      expect(res.body.access_token).toBeDefined();
    });

    it('refuse un refresh token invalide', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: 'invalid.token.value' })
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('invalide la session', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: 'e2e.habitant@mysyndic.ci', password: 'E2eToken!X' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${login.body.access_token}`)
        .expect(200);
    });
  });
});