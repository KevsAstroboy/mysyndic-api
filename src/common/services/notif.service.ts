import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatGateway } from '../../sockets/chat.gateway';

export interface SendNotifParams {
  cite_id: string;
  user_id: string;
  titre: string;
  message?: string;
  typeId?: number;
  data?: Record<string, unknown>;
}

export interface SendToCiteOptions {
  features?: string[];
  exceptUserId?: string;
  typeId?: number;
  data?: Record<string, unknown>;
}

/**
 * Notification in-app (sprint 4). Insert PG + émission socket temps réel.
 * Ciblage : occupants actifs, syndics (features), exclusion émetteur.
 */
@Injectable()
export class NotifService {
  private readonly logger = new Logger(NotifService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatGateway,
  ) {}

  async sendToUser(params: SendNotifParams): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          cite_id: params.cite_id,
          user_id: params.user_id,
          type_id: params.typeId ?? null,
          titre: params.titre,
          message: params.message,
          lu: false,
          data: (params.data as any) ?? undefined,
          created_at: new Date(),
        } as any,
      });
      this.chat.emitToUser(params.user_id, 'notification:nouvelle', {
        id: undefined,
        titre: params.titre,
        message: params.message,
        type_id: params.typeId ?? null,
        data: params.data ?? null,
        lu: false,
        created_at: new Date(),
        cite_id: params.cite_id,
      });
    } catch (e) {
      this.logger.warn(`Notification insert failed: ${String(e)}`);
    }
  }

  async sendToCiteOccupants(
    cite_id: string,
    titre: string,
    message: string,
  ): Promise<void> {
    await this.sendToCite(cite_id, titre, message);
  }

  async sendToCite(
    cite_id: string,
    titre: string,
    message: string,
    options: SendToCiteOptions = {},
  ): Promise<void> {
    try {
      const occupants = await this.prisma.user.findMany({
        where: { cite_id, is_active: true, is_deleted: false },
        select: { id: true },
      });

      let targets = occupants.filter((u) => u.id !== options.exceptUserId);

      if (options.features && options.features.length > 0) {
        const targetIds = targets.map((t) => t.id);
        // Le rôle doit être rattaché À CETTE cité (user_profil.cite_id).
        // Sans ce scope, un user multi-cités (ex. chef sécurité de la cité A et
        // simple habitant de la cité B) recevrait les alertes de la cité B via
        // sa feature de la cité A. Les profils globaux (cite_id NULL, ex.
        // super-admin) restent éligibles car sans rattachement cité.
        const hits = await this.prisma.user_profil.findMany({
          where: {
            user_id: { in: targetIds },
            cite_id: { in: [cite_id, null] } as any,
            is_active: true,
            profil: {
              is_deleted: false,
              profil_feature: {
                some: {
                  feature: { code: { in: options.features }, is_deleted: false },
                  is_deleted: false,
                },
              },
            },
          },
          select: { user_id: true },
        });
        const allowed = new Set(hits.map((h) => h.user_id));
        targets = targets.filter((t) => allowed.has(t.id));
      }

      await Promise.all(
        targets.map((u) =>
          this.sendToUser({
            cite_id,
            user_id: u.id,
            titre,
            message,
            typeId: options.typeId,
            data: options.data,
          }),
        ),
      );
    } catch (e) {
      this.logger.warn(`Broadcast notification failed: ${String(e)}`);
    }
  }
}