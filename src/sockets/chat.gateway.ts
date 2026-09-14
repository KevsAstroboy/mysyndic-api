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
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

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
    } catch (e) {
      this.logger.warn(`Connexion socket refusée : ${String(e)}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    client.rooms.forEach((room) => {
      if (room !== client.id) client.leave(room);
    });
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