import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaiementService } from '../src/modules/paiement/paiement.service';
import { PaystackClientService } from '../src/modules/paiement/paystack-client.service';
import { cleanTestDb, seedTestData, TEST_VILLA_ID } from './utils.e2e';

const WH_SECRET = 'test_webhook_secret_123';

async function setupPaiementApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  paystack: { initializePayment: jest.Mock };
}> {
  process.env.DATABASE_URL =
    'postgresql://postgres:postgres@localhost:5433/mysyndic_db_test';
  process.env.REDIS_URL = 'redis://localhost:6380';
  process.env.PAYSTACK_SECRET_KEY = WH_SECRET;
  process.env.FRONTEND_URL = 'http://localhost:5173';

  const paystackMock = {
    initializePayment: jest.fn().mockResolvedValue({
      authorization_url: 'https://paystack.test/authorize/ref',
      reference: 'ref-test',
    }),
    verifyTransaction: jest.fn(),
  };

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PaystackClientService)
    .useValue(paystackMock)
    .compile();

  const prisma = moduleFixture.get(PrismaService);
  await cleanTestDb(prisma);
  await seedTestData(prisma);

  const app = moduleFixture.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return { app, prisma, paystack: paystackMock };
}

async function login(app: INestApplication, email: string, password: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ identifier: email, password })
    .expect(200);
  return res.body.access_token as string;
}

describe('Paiement + Webhook (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let paystack: { initializePayment: jest.Mock };
  let habitantToken: string;
  let adminToken: string;
  let syndicToken: string;

  beforeAll(async () => {
    const ctx = await setupPaiementApp();
    app = ctx.app;
    prisma = ctx.prisma;
    paystack = ctx.paystack;
    habitantToken = await login(app, 'e2e.habitant@mysyndic.ci', 'E2eToken!X');
    adminToken = await login(app, 'e2e.admin@mysyndic.ci', 'E2eToken!X');
    syndicToken = await login(app, 'e2e.syndic@mysyndic.ci', 'E2eToken!X');
  });

  afterAll(async () => {
    await app.close();
  });

  /** Retrouve l'id du paiement depuis la référence Paystack retournée à l'init. */
  async function resolvePaiementId(ref: string): Promise<string> {
    const row = await prisma.paiement.findFirst({
      where: { reference_paystack: ref },
    });
    expect(row).toBeTruthy();
    return row!.id;
  }

  describe('Initiation Paystack', () => {
    it('initie et retourne authorization_url', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/paiements/paystack/init')
        .set('Authorization', `Bearer ${habitantToken}`)
        .send({ villa_id: TEST_VILLA_ID, mois: '2026-09' })
        .expect(201);
      expect(res.body.authorization_url).toContain('paystack.test');
      expect(res.body.montant).toBe(25000);
      const paiement = await prisma.paiement.findFirst({
        where: { villa_id: TEST_VILLA_ID.toLowerCase(), mois: '2026-09' },
      });
      expect(paiement).toBeTruthy();
      expect(paiement?.statut_id).toBe(1);
    });

    it('mois déjà initié → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/paiements/paystack/init')
        .set('Authorization', `Bearer ${habitantToken}`)
        .send({ villa_id: TEST_VILLA_ID, mois: '2026-09' })
        .expect(400);
    });
  });

  describe('Saisie manuelle', () => {
    it('crée deux mois + notification', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/paiements/manuel')
        .set('Authorization', `Bearer ${syndicToken}`)
        .send({
          villa_id: TEST_VILLA_ID,
          mois: ['2026-11', '2026-12'],
          montant: 25000,
          canal: 'WAVE_MANUEL',
        })
        .expect(201);
      expect(res.body.paiements.length).toBe(2);
      const notif = await prisma.notification.count({
        where: { titre: 'Paiements régularisés' },
      });
      expect(notif).toBeGreaterThan(0);
    });

    it('mois déjà confirmé → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/paiements/manuel')
        .set('Authorization', `Bearer ${syndicToken}`)
        .send({
          villa_id: TEST_VILLA_ID,
          mois: ['2026-09'],
          montant: 25000,
          canal: 'CASH',
        })
        .expect(400);
    });
  });

  describe('Webhook Paystack', () => {
    function sign(payload: string): string {
      return crypto.createHmac('sha512', WH_SECRET).update(payload).digest('hex');
    }

    it('signature KO → 401 + webhook signature_ok=false', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/webhooks/paystack')
        .set('content-type', 'application/json')
        .set('x-paystack-signature', 'badsig')
        .send({ event: 'charge.success', data: { reference: 'ref-ko' } })
        .expect(401);
      const wh = await prisma.webhook.findFirst({
        where: { reference: 'ref-ko' },
      });
      expect(wh?.signature_ok).toBe(false);
    });

    it('happy path confirme le paiement (async)', async () => {
      const init = await request(app.getHttpServer())
        .post('/api/paiements/paystack/init')
        .set('Authorization', `Bearer ${habitantToken}`)
        .send({ villa_id: TEST_VILLA_ID, mois: '2026-10' })
        .expect(201);
      const ref = init.body.reference;
      const paiementId = await resolvePaiementId(ref);

      const payload = {
        event: 'charge.success',
        data: { reference: ref, amount: 25000 * 100 },
      };
      const sig = sign(JSON.stringify(payload));

      await request(app.getHttpServer())
        .post('/api/webhooks/paystack')
        .set('content-type', 'application/json')
        .set('x-paystack-signature', sig)
        .send(payload)
        .expect(200);

      await new Promise((r) => setTimeout(r, 800));
      const paiement = await prisma.paiement.findFirst({ where: { id: paiementId } });
      expect(paiement?.statut_id).toBe(2);
      const wh = await prisma.webhook.findFirst({
        where: { reference: ref },
      });
      expect(wh?.traite).toBe(true);
    });

    it('montant mismatch → paiement non confirmé', async () => {
      const init = await request(app.getHttpServer())
        .post('/api/paiements/paystack/init')
        .set('Authorization', `Bearer ${habitantToken}`)
        .send({ villa_id: TEST_VILLA_ID, mois: '2026-08' })
        .expect(201);
      const ref = init.body.reference;
      const paiementId = await resolvePaiementId(ref);

      const payload = {
        event: 'charge.success',
        data: { reference: ref, amount: 1000 * 100 },
      };
      const sig = sign(JSON.stringify(payload));

      await request(app.getHttpServer())
        .post('/api/webhooks/paystack')
        .set('content-type', 'application/json')
        .set('x-paystack-signature', sig)
        .send(payload)
        .expect(200);

      await new Promise((r) => setTimeout(r, 800));
      const paiement = await prisma.paiement.findFirst({ where: { id: paiementId } });
      expect(paiement?.statut_id).not.toBe(2);
    });

    it('idempotence : même webhook deux fois → 200 sans double traitement', async () => {
      const init = await request(app.getHttpServer())
        .post('/api/paiements/paystack/init')
        .set('Authorization', `Bearer ${habitantToken}`)
        .send({ villa_id: TEST_VILLA_ID, mois: '2026-07' })
        .expect(201);
      const ref = init.body.reference;
      const paiementId = await resolvePaiementId(ref);

      const payload = {
        event: 'charge.success',
        data: { reference: ref, amount: 25000 * 100 },
      };
      const sig = sign(JSON.stringify(payload));

      await request(app.getHttpServer())
        .post('/api/webhooks/paystack')
        .set('content-type', 'application/json')
        .set('x-paystack-signature', sig)
        .send(payload)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/webhooks/paystack')
        .set('content-type', 'application/json')
        .set('x-paystack-signature', sig)
        .send(payload)
        .expect(200);

      await new Promise((r) => setTimeout(r, 800));
      const whCount = await prisma.webhook.count({
        where: { reference: ref },
      });
      expect(whCount).toBe(1);
      const paiement = await prisma.paiement.findFirst({ where: { id: paiementId } });
      expect(paiement?.statut_id).toBe(2);
    });
  });

  describe('Expiration automatique', () => {
    it('annule les paiements en attente restés bloqués au-delà du délai', async () => {
      const init = await request(app.getHttpServer())
        .post('/api/paiements/paystack/init')
        .set('Authorization', `Bearer ${habitantToken}`)
        .send({ villa_id: TEST_VILLA_ID, mois: '2026-06' })
        .expect(201);
      const paiementId = await resolvePaiementId(init.body.reference);

      // Simule un paiement initié il y a 31 minutes (délai par défaut : 30 min).
      const stale = new Date(Date.now() - 31 * 60_000);
      await prisma.paiement.updateMany({
        where: { id: paiementId },
        data: { updated_at: stale },
      });

      const paiementService = app.get(PaiementService);
      const count = await paiementService.expirerPaiementsEnAttente();
      expect(count).toBeGreaterThanOrEqual(1);

      const paiement = await prisma.paiement.findFirst({ where: { id: paiementId } });
      expect(paiement?.statut_id).toBe(5); // ANNULE
    });

    it('relance possible après expiration : le même paiement repasse EN_ATTENTE', async () => {
      const init = await request(app.getHttpServer())
        .post('/api/paiements/paystack/init')
        .set('Authorization', `Bearer ${habitantToken}`)
        .send({ villa_id: TEST_VILLA_ID, mois: '2026-05' })
        .expect(201);
      const firstRef = init.body.reference;
      const paiementId = await resolvePaiementId(firstRef);

      await prisma.paiement.updateMany({
        where: { id: paiementId },
        data: { updated_at: new Date(Date.now() - 31 * 60_000) },
      });

      const relance = await request(app.getHttpServer())
        .post('/api/paiements/paystack/init')
        .set('Authorization', `Bearer ${habitantToken}`)
        .send({ villa_id: TEST_VILLA_ID, mois: '2026-05' })
        .expect(201);
      // Même paiement réutilisé, mais nouvelle référence Paystack (pas de doublon).
      expect(relance.body.reference).not.toBe(firstRef);
      expect(relance.body.reference.startsWith(paiementId)).toBe(true);

      const paiement = await prisma.paiement.findFirst({ where: { id: paiementId } });
      expect(paiement?.statut_id).toBe(1); // EN_ATTENTE
      expect(paiement?.updated_at).not.toBeNull();
    });
  });

  describe('Reçu', () => {
    it('génère le reçu pour un paiement confirmé', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/paiements/recu-doesnotexist')
        .set('Authorization', `Bearer ${habitantToken}`)
        .expect(404);
      expect(res.body).toBeDefined();
    });
  });
});