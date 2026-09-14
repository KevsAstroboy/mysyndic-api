import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp } from './utils.e2e';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Message (e2e)', () => {
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

  async function userId(email: string) {
    const u = await prisma.user.findFirstOrThrow({ where: { email } });
    return u.id;
  }

  it('HABITANT envoie un message privé au SYNDIC, lu dans le thread', async () => {
    const habitantToken = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');
    const syndicId = await userId('e2e.syndic@mysyndic.ci');

    const sent = await request(app.getHttpServer())
      .post('/api/messages/private')
      .set('Authorization', `Bearer ${habitantToken}`)
      .send({ destinataire_id: syndicId, contenu: 'Bonsoir madame' })
      .expect(201);
    expect(sent.body.est_groupe).toBe(false);
    expect(sent.body.destinataire_id).toBe(syndicId);
    expect(sent.body.contenu).toBe('Bonsoir madame');

    const convs = await request(app.getHttpServer())
      .get('/api/messages/conversations')
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);
    expect(convs.body.length).toBeGreaterThanOrEqual(1);
    expect(convs.body[0].other_user_id).toBe(syndicId);
    expect(convs.body[0].est_groupe).toBe(false);
  });

  it('message privé vers un destinataire hors cité → 400', async () => {
    const habitantToken = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');

    const OTHER_CITE_ID = '00000000-0000-0000-0000-000000000099';

    await prisma.cite.upsert({
      where: { id: OTHER_CITE_ID },
      create: { id: OTHER_CITE_ID, nom: 'Autre cité e2e', pays: "Côte d'Ivoire" },
      update: {},
    });

    const otherCiteUser = await prisma.user.create({
      data: {
        email: 'e2e.autre@mysyndic.ci',
        prenom: 'Autre',
        nom: 'Cite',
        password_hash: '$2b$04$hqps48lagMvnDh033RZT4e4wQcDGTn6/cAogJuLbC8WYU/gypWx6y',
        cite_id: OTHER_CITE_ID,
        is_active: true,
        must_change_password: false,
      },
    });

    await request(app.getHttpServer())
      .post('/api/messages/private')
      .set('Authorization', `Bearer ${habitantToken}`)
      .send({ destinataire_id: otherCiteUser.id, contenu: 'hors cite' })
      .expect(400);
  });

  it('CHEF_SECURITE sans MESSAGE_SEND_PRIVATE → 403', async () => {
    const chefToken = await login('e2e.chef@mysyndic.ci', 'E2eToken!X');
    const syndicId = await userId('e2e.syndic@mysyndic.ci');

    await request(app.getHttpServer())
      .post('/api/messages/private')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({ destinataire_id: syndicId, contenu: 'non autorise' })
      .expect(403);
  });

  it('message de groupe diffusé à la cité', async () => {
    const habitantToken = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');

    const sent = await request(app.getHttpServer())
      .post('/api/messages/groupe')
      .set('Authorization', `Bearer ${habitantToken}`)
      .send({ contenu: 'Bonjour la cité' })
      .expect(201);
    expect(sent.body.est_groupe).toBe(true);
    expect(sent.body.groupe_id).toBeDefined();

    const convs = await request(app.getHttpServer())
      .get('/api/messages/conversations')
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);
    expect(convs.body.some((c: any) => c.est_groupe)).toBe(true);
  });

  it('marquage lu + supprimer son message OK, message d\'autrui 403', async () => {
    const habitantToken = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');
    const syndicToken = await login('e2e.syndic@mysyndic.ci', 'E2eToken!X');
    const syndicId = await userId('e2e.syndic@mysyndic.ci');

    const sent = await request(app.getHttpServer())
      .post('/api/messages/private')
      .set('Authorization', `Bearer ${habitantToken}`)
      .send({ destinataire_id: syndicId, contenu: 'message a supprimer' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/messages/${sent.body.id}/lu`)
      .set('Authorization', `Bearer ${syndicToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/messages/${sent.body.id}`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);

    const thread = await request(app.getHttpServer())
      .get(`/api/messages/conversations/${syndicId}`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);
    expect(thread.body.filter((m: any) => m.id === sent.body.id).length).toBe(0);

    const autre = await request(app.getHttpServer())
      .post('/api/messages/private')
      .set('Authorization', `Bearer ${syndicToken}`)
      .send({ destinataire_id: await userId('e2e.habitant@mysyndic.ci'), contenu: 'reponse syndic' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/messages/${autre.body.id}`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(403);
  });
});