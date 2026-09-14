import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp } from './utils.e2e';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Document (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.MINIO_ENDPOINT = 'localhost';
    process.env.MINIO_INTERNAL_PORT = '9010';
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

  it('SYNDIC upload, liste, télécharge et supprime un document', async () => {
    const token = await login('e2e.syndic@mysyndic.ci', 'E2eToken!X');

    const uploaded = await request(app.getHttpServer())
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .field('titre', 'Procès verbal')
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'pv.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(uploaded.body.titre).toBe('Procès verbal');
    expect(uploaded.body.file_path).toContain('documents');
    expect(uploaded.body.taille_ko).toBe(0);

    const list = await request(app.getHttpServer())
      .get('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].titre).toBe('Procès verbal');

    const dl = await request(app.getHttpServer())
      .get(`/api/documents/${uploaded.body.id}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(dl.body.url).toContain('http');

    await request(app.getHttpServer())
      .delete(`/api/documents/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.length).toBe(0);
  });

  it('HABITANT peut lire mais pas uploader ni supprimer', async () => {
    const habitantToken = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');
    const syndicToken = await login('e2e.syndic@mysyndic.ci', 'E2eToken!X');

    const uploaded = await request(app.getHttpServer())
      .post('/api/documents')
      .set('Authorization', `Bearer ${syndicToken}`)
      .field('titre', 'Doc habitant')
      .attach('file', Buffer.from('contenu'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/documents')
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);
    expect(list.body.length).toBe(1);

    await request(app.getHttpServer())
      .post('/api/documents')
      .set('Authorization', `Bearer ${habitantToken}`)
      .field('titre', 'Non authorise')
      .attach('file', Buffer.from('x'), {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/documents/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(403);
  });
});