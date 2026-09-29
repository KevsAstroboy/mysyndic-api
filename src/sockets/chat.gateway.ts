import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../common/types/jwt-payload.interface';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  // Sous `/api/...` : le relais Next (mode lien public) proxy déjà /api/*.
  // Next retire le slash final → `addTrailingSlash: false` pour que engine.io
  // accepte `/api/socket.io` sans slash.
  path: '/api/socket.io',
  addTrailingSlash: false,
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  /**
   * Présence : userId → ensemble des sockets ouverts. En mémoire (instance
   * unique). Sert à afficher « en ligne / hors ligne » dans la messagerie.
   */
  private readonly online = new Map<string, Set<string>>();

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  afterInit(server: Server) {
    this.logger.log('Socket.IO initialisé');
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) throw new UnauthorizedException('Authentification requise');

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

      const userId = payload.sub;
      client.data.userId = userId;
      client.data.citeId = payload.cite_id ?? null;

      await client.join(`user:${userId}`);
      if (payload.cite_id) {
        await client.join(`cite:${payload.cite_id}`);
      }

      // Présence : premier socket de cet utilisateur → il devient « en ligne ».
      const first = !this.online.has(userId);
      const set = this.online.get(userId) ?? new Set<string>();
      set.add(client.id);
      this.online.set(userId, set);
      if (first && payload.cite_id) {
        this.server
          ?.to(`cite:${payload.cite_id}`)
          .emit('presence:update', { user_id: userId, en_ligne: true });
      }
    } catch (e) {
      this.logger.warn(`Connexion socket refusée : ${String(e)}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    const citeId = client.data.citeId as string | null | undefined;
    if (userId) {
      const set = this.online.get(userId);
      if (set) {
        set.delete(client.id);
        if (set.size === 0) {
          this.online.delete(userId);
          if (citeId) {
            this.server
              ?.to(`cite:${citeId}`)
              .emit('presence:update', { user_id: userId, en_ligne: false });
          }
        }
      }
    }
    client.rooms.forEach((room) => {
      if (room !== client.id) client.leave(room);
    });
  }

  isOnline(userId: string): boolean {
    return this.online.has(userId);
  }

  /** Présence en lot : { userId: true|false }. */
  areOnline(userIds: string[]): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const id of userIds) out[id] = this.online.has(id);
    return out;
  }

  @SubscribeMessage('ping')
  handlePing(@MessageBody() data: unknown): { event: string; data: unknown } {
    return { event: 'pong', data };
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitToCite(citeId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`cite:${citeId}`).emit(event, payload);
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token;
    const header = client.handshake.headers?.authorization;
    if (header && header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    return null;
  }
}