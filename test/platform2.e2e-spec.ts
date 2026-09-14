import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp, TEST_CITE_ID, TEST_VILLA_ID, TEST_USERS } from './utils.e2e';
import { PrismaService } from '../src/prisma/prisma.service';

// MinIO accessible depuis l'hôte (comme document.e2e-spec)
process.env.MINIO_ENDPOINT = 'localhost';
process.env.MINIO_INTERNAL_PORT = '9010';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('DSL critères + multipart + preview + multi-profil', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken = '';
  let syndicToken = '';
  let habitantToken = '';
  let superToken = '';

  async function login(email: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: email, password })
      .expect(200);
    return res.body;
  }

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
    prisma = ctx.prisma;

    const admin = await login(TEST_USERS.admin.email, TEST_USERS.admin.password);
    const syndic = await login(TEST_USERS.syndic.email, TEST_USERS.syndic.password);
    const habitant = await login(TEST_USERS.habitant.email, TEST_USERS.habitant.password);
    const sa = await login(TEST_USERS.superAdmin.email, TEST_USERS.superAdmin.password);
    adminToken = admin.access_token;
    syndicToken = syndic.access_token;
    habitantToken = habitant.access_token;
    superToken = sa.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── DSL get-by-criteria paginé ──────────────────────────────
  describe('DSL get-by-criteria paginé', () => {
    it('users : pagine + tri + filtre like', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/get-by-criteria')
        .query({ sort: '-created_at', size: 2, 'nom.like': 'e2e' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(res.body.page).toBe(1);
      expect(res.body.size).toBe(2);
      expect(res.body.pages).toBe(Math.ceil(res.body.total / 2));
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
    });

    it('users : fields projection + page', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/get-by-criteria')
        .query({ fields: 'prenom,nom,email', page: 1, size: 3 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      const keys = Object.keys(res.body.items[0]);
      expect(keys.sort()).toEqual(['email', 'nom', 'prenom']);
    });

    it('users : champ inconnu ignoré (pas d erreur)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/get-by-criteria')
        .query({ 'champ_inconnu.eq': 'x', size: 5 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it('paiements : pagine par cité', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/paiements/get-by-criteria')
        .set('Authorization', `Bearer ${syndicToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('items');
    });
  });

  // ── Multipart alerte + preview fichier ──────────────────────
  describe('multipart + preview', () => {
    it('crée une alerte avec photo multipart puis la prévisualise', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/alertes')
        .field('description', 'Alerte photo E2E')
        .attach('photo', PNG_1PX, { filename: 'alerte.png', contentType: 'image/png' })
        .set('Authorization', `Bearer ${habitantToken}`)
        .expect(201);
      expect(created.body.photo_file_path).toMatch(/^alertes\//);

      const path = encodeURIComponent(created.body.photo_file_path);
      const prev = await request(app.getHttpServer())
        .get(`/api/files/preview?path=${path}`)
        .set('Authorization', `Bearer ${habitantToken}`)
        .expect(200);
      expect(prev.headers['content-type']).toContain('image/png');
    });

    it('refuse un mauvais type de fichier sur incident', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/incidents')
        .field('description', 'Incident fichier texte')
        .attach('photo', Buffer.from('fake'), { filename: 'x.txt', contentType: 'text/plain' })
        .set('Authorization', `Bearer ${habitantToken}`)
        .expect(400);
      expect(res.body.message).toMatch(/image/i);
    });
  });

  // ── Reçu PNG + preview ──────────────────────────────────────
  describe('reçu PNG thème', () => {
    let paiementId = '';

    it('saisie manuelle multipart (preuve image)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/paiements/manuel')
        .field('villa_id', TEST_VILLA_ID)
        .field('mois', '2026-01')
        .field('montant', '25000')
        .field('canal', 'WAVE_MANUEL')
        .attach('preuve', PNG_1PX, { filename: 'preuve.png', contentType: 'image/png' })
        .set('Authorization', `Bearer ${syndicToken}`)
        .expect(201);
      expect(res.body.paiements.length).toBe(1);
      paiementId = res.body.paiements[0].id;

      const row = await prisma.paiement.findFirstOrThrow({
        where: { id: paiementId },
      });
      expect(row.preuve_file_path).toMatch(/^preuves\//);
    });

    it('GET /recu renvoie file_path .png + preview_url lisible', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/paiements/${paiementId}/recu`)
        .set('Authorization', `Bearer ${syndicToken}`)
        .expect(200);
      expect(res.body.file_path).toMatch(/\.png$/);
      expect(res.body.preview_url).toContain('/api/files/preview?path=');

      const q = res.body.preview_url.split('?')[1];
      const prev = await request(app.getHttpServer())
        .get(`/api/files/preview?${q}`)
        .set('Authorization', `Bearer ${syndicToken}`)
        .expect(200);
      expect(prev.headers['content-type']).toContain('image/png');
      expect(prev.body.length).toBeGreaterThan(1000);
    });

    it('refuse la preview d un fichier d une autre cité', async () => {
      await request(app.getHttpServer())
        .get('/api/files/preview?path=recus%2F00000000-0000-0000-0000-00000000ffff%2Fx.png')
        .set('Authorization', `Bearer ${syndicToken}`)
        .expect(403);
    });
  });

  // ── Multi-profil / multi-cité + switch ──────────────────────
  describe('multi-profil & switch de contexte', () => {
    let adminSyndicUpId = '';

    beforeAll(async () => {
      const user = await prisma.user.findFirstOrThrow({
        where: { email: TEST_USERS.admin.email },
      });
      const syndicProfil = await prisma.profil.findFirstOrThrow({
        where: { code: 'SYNDIC' },
      });
      const up = await prisma.user_profil.create({
        data: {
          user_id: user.id,
          profil_id: syndicProfil.id,
          cite_id: TEST_CITE_ID,
          order_priority: 2,
        },
      });
      adminSyndicUpId = up.id;
      // invalide la session admin pour qu'elle soit recomputée
      await prisma.$executeRawUnsafe(`CALL snapshot_profil_features(${syndicProfil.id}, 'e2e-probe')`);
    });

    it('login expose la liste des profils + cité', async () => {
      const res = await login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      expect(Array.isArray(res.profils)).toBe(true);
      const codes = res.profils.map((p: any) => p.code);
      expect(codes).toContain('ADMIN');
      expect(codes).toContain('SYNDIC');
      expect(res.profil_actif_user_profil_id).toBeTruthy();
      // le profil actif porte sa cité
      expect(res.profils[0].citeNom).toBeDefined();
    });

    it('GET /auth/profils liste les profils actifs', async () => {
      const admin = await login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      const res = await request(app.getHttpServer())
        .get('/api/auth/profils')
        .set('Authorization', `Bearer ${admin.access_token}`)
        .expect(200);
      expect(res.body.profils.length).toBeGreaterThanOrEqual(2);
    });

    it('POST /auth/context bascule vers SYNDIC (features restreintes)', async () => {
      const admin = await login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      const res = await request(app.getHttpServer())
        .post('/api/auth/context')
        .send({ user_profil_id: adminSyndicUpId })
        .set('Authorization', `Bearer ${admin.access_token}`)
        .expect(200);
      expect(res.body.profil_actif_user_profil_id).toBe(adminSyndicUpId);
      expect(res.body.profils.some((p: any) => p.code === 'SYNDIC')).toBe(true);
      // feature ADMIN absente du contexte SYNDIC
      expect(res.body.features).not.toContain('ADMIN_CREATE_STAFF');
      // l ancien token suit le contexte (rôle via session)
      await request(app.getHttpServer())
        .post('/api/users/staff')
        .send({
          prenom: 'X',
          nom: 'Y',
          email: 'nope.staff@mysyndic.ci',
          profil_code: 'SYNDIC',
        })
        .set('Authorization', `Bearer ${admin.access_token}`)
        .expect(403);
    });

    it('context invalide -> 400', async () => {
      const admin = await login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      await request(app.getHttpServer())
        .post('/api/auth/context')
        .send({ user_profil_id: '00000000-0000-0000-0000-00000000ffff' })
        .set('Authorization', `Bearer ${admin.access_token}`)
        .expect(400);
    });
  });

  // ── SA : créer admin + assigner des profils ─────────────────
  describe('Super Admin : créer ADMIN + assigner profils', () => {
    let targetUserId = '';

    it('créer un ADMIN via /users/admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users/admin')
        .send({
          prenom: 'Aya',
          nom: 'Admin',
          email: 'aya.admin.e2e@mysyndic.ci',
          telephone: '+225 07 00 00 01',
          cite_id: TEST_CITE_ID,
        })
        .set('Authorization', `Bearer ${superToken}`)
        .expect(201);
      expect(res.body.user.profil).toBe('ADMIN');
      targetUserId = res.body.user.id;
    });

    it('assigner HABITANT + SYNDIC à ce user', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/users/${targetUserId}/profils`)
        .send({
          profils: [
            { profil_code: 'HABITANT', cite_id: TEST_CITE_ID, order_priority: 2 },
            { profil_code: 'SYNDIC', cite_id: TEST_CITE_ID, order_priority: 3 },
          ],
        })
        .set('Authorization', `Bearer ${superToken}`)
        .expect(201);
      const codes = res.body.profils.map((p: any) => p.code).sort();
      expect(codes).toEqual(['ADMIN', 'HABITANT', 'SYNDIC']);
    });

    it('retirer le profil SYNDIC', async () => {
      const before = await prisma.user_profil.findFirst({
        where: { user_id: targetUserId },
        include: { profil: true },
      });
      const rows = await prisma.user_profil.findMany({
        where: { user_id: targetUserId, is_deleted: false, is_active: true },
        include: { profil: true },
      });
      const syndicUp = rows.find((r) => r.profil?.code === 'SYNDIC');
      const res = await request(app.getHttpServer())
        .delete(`/api/users/${targetUserId}/profils/${syndicUp!.id}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);
      expect(res.body.profils.map((p: any) => p.code)).not.toContain('SYNDIC');
      expect(before).toBeTruthy();
    });

    it('refuse de retirer le dernier profil actif', async () => {
      const rows = await prisma.user_profil.findMany({
        where: { user_id: targetUserId, is_deleted: false, is_active: true },
      });
      // on retire tous sauf 1 pour tester le garde-fou
      for (let i = 1; i < rows.length; i++) {
        await prisma.user_profil.update({
          where: { id: rows[i].id },
          data: { is_deleted: true, is_active: false },
        });
      }
      const last = await prisma.user_profil.findFirstOrThrow({
        where: { user_id: targetUserId, is_deleted: false, is_active: true },
      });
      await request(app.getHttpServer())
        .delete(`/api/users/${targetUserId}/profils/${last.id}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(400);
    });
  });
});
