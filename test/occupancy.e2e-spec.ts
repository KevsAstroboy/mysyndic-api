import { setupTestApp, TEST_CITE_ID, TEST_VILLA_ID } from './utils.e2e';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import * as request from 'supertest';

const MDP = 'Str0ngP@ss!999';

async function login(app: INestApplication, email: string, password: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ identifier: email, password })
    .expect(200);
  return res.body.access_token as string;
}

describe('Occupations de villa (confirmation syndic / colocataires / départ)', () => {
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

  it('scénario complet occupation : libre->syndic, occupée->colocataire, départ, annulation, cross-cité', async () => {
    const adminToken = await login(app, 'e2e.admin@mysyndic.ci', 'E2eToken!X');
    const syndicToken = await login(app, 'e2e.syndic@mysyndic.ci', 'E2eToken!X');
    const habitantToken = await login(app, 'e2e.habitant@mysyndic.ci', 'E2eToken!X');

    // ── Découverte publique ───────────────────────────────
    const citesPub = await request(app.getHttpServer()).get('/api/public/cites').expect(200);
    expect(citesPub.body.some((c: any) => c.id === TEST_CITE_ID)).toBe(true);

    const villasPub = await request(app.getHttpServer())
      .get(`/api/public/cites/${TEST_CITE_ID}/villas`)
      .expect(200);
    const tv = villasPub.body.find((v: any) => v.id.toLowerCase() === TEST_VILLA_ID.toLowerCase());
    expect(tv).toBeDefined();
    expect(tv.statut).toBe('occupee');

    // ── Villa libre A -> première occupation par syndic ──
    const villaA = await request(app.getHttpServer())
      .post('/api/villas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ numero: 'OCC-A' })
      .expect(201);
    const villaAId = villaA.body.id;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ prenom: 'Occ1', nom: 'Test', email: 'occ.a1@mysyndic.ci', telephone: '+225 07 11 00 01', password: MDP, villa_id: villaAId })
      .expect(201);

    // 2e candidat sur villa libre en attente -> 409
    const deuxieme = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ prenom: 'Occ1b', nom: 'Test', email: 'occ.a1b@mysyndic.ci', telephone: '+225 07 11 00 02', password: MDP, villa_id: villaAId })
      .expect(409);
    expect(deuxieme.body.code ?? deuxieme.body.message).toBeDefined();

    // activation u1 (candidat première occupation) puis action bloquée
    const u1 = await prisma.user.findFirstOrThrow({ where: { email: 'occ.a1@mysyndic.ci' } });
    const otp1 = await prisma.otp.findFirstOrThrow({ where: { user_id: u1.id, contexte: 'ACCOUNT_ACTIVATION', is_used: false }, orderBy: { created_at: 'desc' } });
    const act1 = await request(app.getHttpServer()).post('/api/auth/activate').send({ email: 'occ.a1@mysyndic.ci', otp_code: otp1.code }).expect(200);
    const u1Token = act1.body.access_token as string;

    await request(app.getHttpServer())
      .post('/api/incidents')
      .set('Authorization', `Bearer ${u1Token}`)
      .send({})
      .expect(403);

    // syndic liste + confirme la première occupation
    const candSyndic = await request(app.getHttpServer())
      .get('/api/villas/candidatures')
      .set('Authorization', `Bearer ${syndicToken}`)
      .expect(200);
    const cand1 = candSyndic.body.find((c: any) => c.user.id === u1.id && c.villa.id === villaAId);
    expect(cand1).toBeDefined();

    await request(app.getHttpServer())
      .post(`/api/villas/candidatures/${cand1.user_villa_id}/confirmer`)
      .set('Authorization', `Bearer ${syndicToken}`)
      .expect(200);

    // confirmé -> le guard passe (400 = validation body, pas 403)
    await request(app.getHttpServer())
      .post('/api/incidents')
      .set('Authorization', `Bearer ${u1Token}`)
      .send({})
      .expect(400);

    const villasA = await request(app.getHttpServer())
      .get(`/api/public/cites/${TEST_CITE_ID}/villas`)
      .expect(200);
    expect(villasA.body.find((v: any) => v.id === villaAId).statut).toBe('occupee');

    // ── Villa occupée -> colocataire validé/refusé par occupants ──
    const reg3 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ prenom: 'Occ3', nom: 'Test', email: 'occ.3@mysyndic.ci', telephone: '+225 07 11 00 03', password: MDP, villa_id: TEST_VILLA_ID })
      .expect(201);
    expect(reg3.body.occupation_en_attente).toBe(true);
    const u3 = await prisma.user.findFirstOrThrow({ where: { email: 'occ.3@mysyndic.ci' } });
    const otp3 = await prisma.otp.findFirstOrThrow({ where: { user_id: u3.id, contexte: 'ACCOUNT_ACTIVATION', is_used: false }, orderBy: { created_at: 'desc' } });
    const act3 = await request(app.getHttpServer()).post('/api/auth/activate').send({ email: 'occ.3@mysyndic.ci', otp_code: otp3.code }).expect(200);
    const u3Token = act3.body.access_token as string;

    // colocataire en attente -> bloqué
    await request(app.getHttpServer())
      .post('/api/incidents')
      .set('Authorization', `Bearer ${u3Token}`)
      .send({})
      .expect(403);

    // occupant confirmé de TEST_VILLA voit la candidature et la valide
    const candVilla = await request(app.getHttpServer())
      .get(`/api/villas/${TEST_VILLA_ID}/candidatures`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);
    const cand3 = candVilla.body.find((c: any) => c.user_id === u3.id);
    expect(cand3).toBeDefined();

    await request(app.getHttpServer())
      .post(`/api/villas/${TEST_VILLA_ID}/candidatures/${cand3.id}/valider`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/incidents')
      .set('Authorization', `Bearer ${u3Token}`)
      .send({})
      .expect(400);

    // occupants list + retrait par habitant confirmé
    const occs = await request(app.getHttpServer())
      .get(`/api/villas/${TEST_VILLA_ID}/occupants`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);
    expect(occs.body.some((o: any) => o.user_id === u3.id)).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/villas/${TEST_VILLA_ID}/occupants/${u3.id}/retirer`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);

    // ── Départ volontaire (dernier occupant -> villa libre) ──
    const villaB = await request(app.getHttpServer())
      .post('/api/villas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ numero: 'OCC-B' })
      .expect(201);
    const villaBId = villaB.body.id;

    const reg4 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ prenom: 'Occ4', nom: 'Test', email: 'occ.4@mysyndic.ci', telephone: '+225 07 11 00 04', password: MDP, villa_id: villaBId })
      .expect(201);
    const u4 = await prisma.user.findFirstOrThrow({ where: { email: 'occ.4@mysyndic.ci' } });
    const otp4 = await prisma.otp.findFirstOrThrow({ where: { user_id: u4.id, contexte: 'ACCOUNT_ACTIVATION', is_used: false }, orderBy: { created_at: 'desc' } });
    const act4 = await request(app.getHttpServer()).post('/api/auth/activate').send({ email: 'occ.4@mysyndic.ci', otp_code: otp4.code }).expect(200);
    const u4Token = act4.body.access_token as string;

    const listSyndic2 = await request(app.getHttpServer())
      .get('/api/villas/candidatures')
      .set('Authorization', `Bearer ${syndicToken}`)
      .expect(200);
    const row4 = listSyndic2.body.find((c: any) => c.user.id === u4.id);
    await request(app.getHttpServer())
      .post(`/api/villas/candidatures/${row4.user_villa_id}/confirmer`)
      .set('Authorization', `Bearer ${syndicToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/villas/${villaBId}/occupants/me/partir`)
      .set('Authorization', `Bearer ${u4Token}`)
      .expect(200);

    const pubB = await request(app.getHttpServer())
      .get(`/api/public/cites/${TEST_CITE_ID}/villas`)
      .expect(200);
    expect(pubB.body.find((v: any) => v.id === villaBId).statut).toBe('libre');

    // ── Annulation de sa propre candidature ────────────────
    const villaC = await request(app.getHttpServer())
      .post('/api/villas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ numero: 'OCC-C' })
      .expect(201);
    const villaCId = villaC.body.id;
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ prenom: 'Occ5', nom: 'Test', email: 'occ.5@mysyndic.ci', telephone: '+225 07 11 00 05', password: MDP, villa_id: villaCId })
      .expect(201);
    const u5 = await prisma.user.findFirstOrThrow({ where: { email: 'occ.5@mysyndic.ci' } });
    const otp5 = await prisma.otp.findFirstOrThrow({ where: { user_id: u5.id, contexte: 'ACCOUNT_ACTIVATION', is_used: false }, orderBy: { created_at: 'desc' } });
    const act5 = await request(app.getHttpServer()).post('/api/auth/activate').send({ email: 'occ.5@mysyndic.ci', otp_code: otp5.code }).expect(200);
    const u5Token = act5.body.access_token as string;

    await request(app.getHttpServer())
      .post(`/api/villas/${villaCId}/candidatures/me/annuler`)
      .set('Authorization', `Bearer ${u5Token}`)
      .expect(200);

    const pubC = await request(app.getHttpServer())
      .get(`/api/public/cites/${TEST_CITE_ID}/villas`)
      .expect(200);
    expect(pubC.body.find((v: any) => v.id === villaCId).statut).toBe('libre');

    // ── Cross-cité simultané : même user occupant confirmé d'une cité,
    //    candidat pending dans une AUTRE cité (villa courante PAR cité) ──
    const cite2Id = '00000000-0000-0000-0000-000000000002';
    await prisma.cite.create({ data: { id: cite2Id, nom: 'E2E Cite 2', pays: "Côte d'Ivoire" } });
    await prisma.groupe_cite.create({ data: { cite_id: cite2Id, nom: 'Chat E2E Cite 2' } });
    const villaD = await prisma.villa.create({ data: { cite_id: cite2Id, numero: 'OCC-D' } });

    // u1 est toujours occupant confirmé de la villa A (TEST_CITE) : il peut
    // quand même candidater dans la cité 2 (deux villas courantes, cités diff.)
    const cross = await request(app.getHttpServer())
      .post('/api/villas/candidatures')
      .set('Authorization', `Bearer ${u1Token}`)
      .send({ villa_id: villaD.id })
      .expect(201);
    expect(cross.body.occupation_en_attente).toBe(true);

    const profilCross = await prisma.user_profil.findFirstOrThrow({
      where: { user_id: u1.id, cite_id: cite2Id, profil: { code: 'HABITANT' } },
    });
    expect(profilCross).toBeDefined();

    // les DEUX villas courantes coexistent (une par cité)
    const courantes = await prisma.user_villa.findMany({
      where: { user_id: u1.id, is_current: true, is_deleted: false },
      select: { cite_id: true, villa_id: true },
    });
    expect(courantes.some((c) => c.cite_id.toLowerCase() === TEST_CITE_ID.toLowerCase() && c.villa_id === villaAId)).toBe(true);
    expect(courantes.some((c) => c.cite_id === cite2Id && c.villa_id === villaD.id)).toBe(true);

    // switch de contexte vers la cité 2
    await request(app.getHttpServer())
      .post('/api/auth/context')
      .set('Authorization', `Bearer ${u1Token}`)
      .send({ user_profil_id: profilCross.id })
      .expect(200);

    const recuCross = await prisma.user_villa.findFirstOrThrow({
      where: { user_id: u1.id, villa_id: villaD.id, is_current: true, is_deleted: false },
    });
    expect(recuCross.is_confirme).toBe(false);

    // nettoyage de la cité 2 (on garde la villa A dans TEST_CITE)
    await prisma.user_profil.deleteMany({ where: { user_id: u1.id, cite_id: cite2Id } });
    await prisma.user_villa.deleteMany({ where: { villa_id: villaD.id } });
  }, 45000);
});
