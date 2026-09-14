import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { setupTestApp } from './utils.e2e';
import { PrismaService } from '../src/prisma/prisma.service';

const PORT = 3456;

describe('Socket chat (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    await app.listen(PORT);
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

  function connect(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`http://localhost:${PORT}`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
      setTimeout(() => reject(new Error('timeout connexion')), 5000);
    });
  }

  it('connexion refusée avec token invalide', (done) => {
    const socket = io(`http://localhost:${PORT}`, {
      auth: { token: 'token-invalide' },
      transports: ['websocket'],
      reconnection: false,
    });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      socket.close();
      done();
    };
    socket.on('connect_error', () => finish());
    socket.on('connect', () => finish());
    setTimeout(() => finish(), 4000);
  });

  it('message:new reçu par destinataire privé', async () => {
    const habitantToken = await login('e2e.habitant@mysyndic.ci', 'E2eToken!X');
    const socket = await connect(habitantToken);

    const syndic = await prisma.user.findFirstOrThrow({
      where: { email: 'e2e.syndic@mysyndic.ci' },
    });

    const received = new Promise((resolve) => {
      socket.on('message:new', (payload) => resolve(payload));
    });

    await request(app.getHttpServer())
      .post('/api/messages/private')
      .set('Authorization', `Bearer ${habitantToken}`)
      .send({ destinataire_id: syndic.id, contenu: 'socket test' })
      .expect(201);

    const payload = await received;
    expect((payload as any).contenu).toBe('socket test');
    socket.disconnect();
  });
});