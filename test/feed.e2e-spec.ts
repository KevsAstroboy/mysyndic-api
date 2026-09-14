import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupTestApp } from './utils.e2e';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Feed (e2e)', () => {
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

  const habitant = () => login('e2e.habitant@mysyndic.ci', 'E2eToken!X');
  const syndic = () => login('e2e.syndic@mysyndic.ci', 'E2eToken!X');

  function photo() {
    return {
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      buffer: Buffer.from('fake-jpeg-bytes'),
    };
  }

  function video(mime = 'video/mp4', name = 'clip.mp4') {
    return { filename: name, contentType: mime, buffer: Buffer.from('fake-video') };
  }

  it('publie un post texte, un post 3 photos et un post vidéo', async () => {
    const token = await habitant();

    const text = await request(app.getHttpServer())
      .post('/api/feed')
      .set('Authorization', `Bearer ${token}`)
      .field('contenu', 'Bonjour le voisinage')
      .expect(201);
    expect(text.body.media_type).toBe('TEXT');
    expect(text.body.media.length).toBe(0);
    expect(text.body.likes_count).toBe(0);

    const photos = await request(app.getHttpServer())
      .post('/api/feed')
      .set('Authorization', `Bearer ${token}`)
      .field('contenu', 'Trois photos')
      .attach('media', photo().buffer, photo())
      .attach('media', photo().buffer, photo())
      .attach('media', photo().buffer, photo())
      .expect(201);
    expect(photos.body.media_type).toBe('PHOTO');
    expect(photos.body.media.length).toBe(3);
    expect(photos.body.media.map((m: any) => m.ordre)).toEqual([1, 2, 3]);
    expect(photos.body.media[0].file_path).toContain('feed/');

    const videoPost = await request(app.getHttpServer())
      .post('/api/feed')
      .set('Authorization', `Bearer ${token}`)
      .field('contenu', 'Une vidéo')
      .attach('media', video().buffer, video())
      .expect(201);
    expect(videoPost.body.media_type).toBe('VIDEO');
    expect(videoPost.body.media.length).toBe(1);
  });

  it('accepte tout codec video/* (ex: quicktime)', async () => {
    const token = await habitant();
    const res = await request(app.getHttpServer())
      .post('/api/feed')
      .set('Authorization', `Bearer ${token}`)
      .attach('media', video('video/quicktime', 'clip.mov').buffer, video('video/quicktime', 'clip.mov'))
      .expect(201);
    expect(res.body.media_type).toBe('VIDEO');
    expect(res.body.media[0].file_path).toMatch(/\.mov$/);
  });

  it('rejette les posts invalides (vide, mélange, trop de médias)', async () => {
    const token = await habitant();

    await request(app.getHttpServer())
      .post('/api/feed')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/feed')
      .set('Authorization', `Bearer ${token}`)
      .attach('media', photo().buffer, photo())
      .attach('media', photo().buffer, photo())
      .attach('media', photo().buffer, photo())
      .attach('media', photo().buffer, photo())
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/feed')
      .set('Authorization', `Bearer ${token}`)
      .attach('media', video().buffer, video())
      .attach('media', video().buffer, video())
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/feed')
      .set('Authorization', `Bearer ${token}`)
      .attach('media', photo().buffer, photo())
      .attach('media', video().buffer, video())
      .expect(400);
  });

  it('like / unlike un post et expose les compteurs', async () => {
    const token = await habitant();
    const created = await request(app.getHttpServer())
      .post('/api/feed')
      .set('Authorization', `Bearer ${token}`)
      .field('contenu', 'Post à liker')
      .expect(201);

    const liked = await request(app.getHttpServer())
      .post(`/api/feed/${created.body.id}/like`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(liked.body.liked).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/feed/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.likes_count).toBe(1);
    expect(detail.body.liked_by_me).toBe(true);

    const unlike = await request(app.getHttpServer())
      .delete(`/api/feed/${created.body.id}/like`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(unlike.body.liked).toBe(false);

    const after = await request(app.getHttpServer())
      .get(`/api/feed/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.likes_count).toBe(0);
  });

  it('commente sur 2 niveaux et rejette le niveau 3', async () => {
    const token = await habitant();
    const created = await request(app.getHttpServer())
      .post('/api/feed')
      .set('Authorization', `Bearer ${token}`)
      .field('contenu', 'Post commentaires')
      .expect(201);

    const comment = await request(app.getHttpServer())
      .post(`/api/feed/${created.body.id}/commentaires`)
      .set('Authorization', `Bearer ${token}`)
      .send({ texte: 'Premier niveau' })
      .expect(201);

    const reply = await request(app.getHttpServer())
      .post(`/api/feed/${created.body.id}/commentaires/${comment.body.id}/repondre`)
      .set('Authorization', `Bearer ${token}`)
      .send({ texte: 'Réponse niveau 2' })
      .expect(201);
    expect(reply.body.niveau).toBe(2);

    await request(app.getHttpServer())
      .post(`/api/feed/${created.body.id}/commentaires/${reply.body.id}/repondre`)
      .set('Authorization', `Bearer ${token}`)
      .send({ texte: 'Niveau 3 interdit' })
      .expect(400);

    const detail = await request(app.getHttpServer())
      .get(`/api/feed/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.commentaires_count).toBe(2);
    expect(detail.body.commentaires.length).toBe(1);
    expect(detail.body.commentaires[0].reponses.length).toBe(1);
  });

  it('pagine par curseur', async () => {
    const token = await habitant();
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/api/feed')
        .set('Authorization', `Bearer ${token}`)
        .field('contenu', `Pagination ${i}`)
        .expect(201);
    }

    const page1 = await request(app.getHttpServer())
      .get('/api/feed?limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(page1.body.items.length).toBe(2);
    expect(page1.body.next_cursor).toBeTruthy();

    const page2 = await request(app.getHttpServer())
      .get(`/api/feed?limit=2&cursor=${page1.body.next_cursor}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(page2.body.items.length).toBeGreaterThan(0);
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
  });

  it('expose le DSL get-by-criteria', async () => {
    const token = await habitant();
    const res = await request(app.getHttpServer())
      .get('/api/feed/get-by-criteria?page=1&size=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('autorise l auteur et le modérateur à supprimer, refuse les autres', async () => {
    const habitantToken = await habitant();
    const syndicToken = await syndic();

    // Post du syndic supprimé par l habitant -> refusé
    const syndicPost = await request(app.getHttpServer())
      .post('/api/feed')
      .set('Authorization', `Bearer ${syndicToken}`)
      .field('contenu', 'Post du syndic')
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/feed/${syndicPost.body.id}`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(403);

    // Post du syndic supprimé par le syndic (modérateur) -> ok
    await request(app.getHttpServer())
      .delete(`/api/feed/${syndicPost.body.id}`)
      .set('Authorization', `Bearer ${syndicToken}`)
      .expect(200);

    // Post de l habitant supprimé par lui-même -> ok
    const ownPost = await request(app.getHttpServer())
      .post('/api/feed')
      .set('Authorization', `Bearer ${habitantToken}`)
      .field('contenu', 'Post perso')
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/feed/${ownPost.body.id}`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/feed/${ownPost.body.id}`)
      .set('Authorization', `Bearer ${habitantToken}`)
      .expect(404);
  });
});
