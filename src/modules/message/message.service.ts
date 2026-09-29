import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageContentService } from '../../message/message-content.service';
import { ChatGateway } from '../../sockets/chat.gateway';
import { NotifService } from '../../common/services/notif.service';
import { SendPrivateMessageDto } from './dto/send-private-message.dto';
import { SendGroupeMessageDto } from './dto/send-groupe-message.dto';

const GROUPE_THREAD_ID = '__groupe__';
const READ_PREFIX = 'msg:read:';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly content: MessageContentService,
    private readonly chat: ChatGateway,
    private readonly notif: NotifService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async sendPrivate(
    citeId: string | null,
    expediteurId: string,
    dto: SendPrivateMessageDto,
  ) {
    const dest = await this.prisma.user.findUnique({
      where: { id: dto.destinataire_id },
      select: {
        id: true,
        cite_id: true,
        is_active: true,
        is_deleted: true,
        cite: { select: { is_active: true } },
        user_profil: {
          where: {
            is_active: true,
            is_deleted: false,
            profil: { code: 'SUPER_ADMIN', is_deleted: false },
          },
          select: { id: true },
        },
      },
    });
    // Super admin global (sans cité) joignable par les membres de toutes les cités.
    const isGlobalSuperAdmin =
      !!dest && !dest.cite_id && dest.user_profil.length > 0;
    if (!dest || dest.is_active !== true || dest.is_deleted === true) {
      throw new BadRequestException(
        'Destinataire invalide ou hors de votre cité',
      );
    }
    // App multi-cités : le destinataire peut être rattaché à la cité de
    // l'expéditeur (villa courante ou profil actif) même si sa cité PRINCIPALE
    // (`user.cite_id`) est différente. Sans ça, impossible de lui répondre.
    const sharesCite = citeId
      ? !!(await this.prisma.user.findFirst({
          where: {
            id: dest.id,
            OR: [
              {
                user_villa: {
                  some: {
                    cite_id: citeId,
                    is_current: true,
                    is_deleted: false,
                  },
                },
              },
              {
                user_profil: {
                  some: {
                    cite_id: citeId,
                    is_active: true,
                    is_deleted: false,
                  },
                },
              },
            ],
          },
          select: { id: true },
        }))
      : false;
    if (
      citeId &&
      dest.cite_id !== citeId &&
      !isGlobalSuperAdmin &&
      !sharesCite
    ) {
      throw new BadRequestException('Destinataire hors de votre cité');
    }
    // Conversation rattachée à la cité de l'expéditeur ; sinon (super admin
    // global) à celle du destinataire.
    const cid = citeId ?? dest.cite_id;
    if (!cid) {
      throw new BadRequestException(
        'Destinataire invalide ou hors de votre cité',
      );
    }

    const message = await this.prisma.message.create({
      data: {
        cite_id: cid,
        expediteur_id: expediteurId,
        destinataire_id: dest.id,
        est_groupe: false,
        created_at: new Date(),
      },
    });

    await this.content.insertContent({
      message_id: message.id,
      contenu: dto.contenu,
    });

    const payload = {
      id: message.id,
      cite_id: cid,
      expediteur_id: expediteurId,
      destinataire_id: dest.id,
      est_groupe: false,
      contenu: dto.contenu,
      created_at: message.created_at,
    };
    this.chat.emitToUser(expediteurId, 'message:new', payload);
    this.chat.emitToUser(dest.id, 'message:new', payload);

    await this.notif.sendToUser({
      cite_id: cid,
      user_id: dest.id,
      titre: 'Nouveau message privé',
      message: dto.contenu,
      typeId: 5,
      data: { message_id: message.id, expediteur_id: expediteurId },
    });

    return payload;
  }

  async sendGroupe(citeId: string, expediteurId: string, dto: SendGroupeMessageDto) {
    const cite = await this.prisma.cite.findFirst({
      where: { id: citeId, is_deleted: false },
      select: { nom: true },
    });
    const nomGroupe = cite?.nom ?? 'Groupe de la cité';

    let groupe = await this.prisma.groupe_cite.findFirst({
      where: { cite_id: citeId, is_deleted: false },
    });
    if (!groupe) {
      groupe = await this.prisma.groupe_cite.create({
        data: {
          cite_id: citeId,
          nom: nomGroupe,
          created_at: new Date(),
        },
      });
    } else if (groupe.nom !== nomGroupe) {
      groupe = await this.prisma.groupe_cite.update({
        where: { id: groupe.id },
        data: { nom: nomGroupe, updated_at: new Date() },
      });
    }

    const message = await this.prisma.message.create({
      data: {
        cite_id: citeId,
        groupe_id: groupe.id,
        expediteur_id: expediteurId,
        est_groupe: true,
        created_at: new Date(),
      },
    });

    await this.content.insertContent({
      message_id: message.id,
      contenu: dto.contenu,
    });

    const payload = {
      id: message.id,
      cite_id: citeId,
      groupe_id: groupe.id,
      expediteur_id: expediteurId,
      est_groupe: true,
      contenu: dto.contenu,
      created_at: message.created_at,
    };
    this.chat.emitToCite(citeId, 'message:new', payload);

    await this.notif.sendToCite(citeId, 'Nouveau message groupe', dto.contenu, {
      typeId: 6,
      exceptUserId: expediteurId,
      data: { message_id: message.id, expediteur_id: expediteurId },
    });

    return payload;
  }

  /** Date d'adhésion du user à la cité (premier rattachement actif). */
  private async getCitizenSince(
    citeId: string | null,
    userId: string,
  ): Promise<Date | null> {
    if (!citeId) return null;
    const up = await this.prisma.user_profil.findFirst({
      where: {
        user_id: userId,
        cite_id: citeId,
        is_active: true,
        is_deleted: false,
      },
      orderBy: { assigned_at: 'asc' },
      select: { assigned_at: true },
    });
    return up?.assigned_at ?? null;
  }

  async getConversations(citeId: string | null, userId: string) {
    const citizenSince = citeId ? await this.getCitizenSince(citeId, userId) : null;
    // Les messages de groupe antérieurs à l'adhésion restent invisibles (et
    // ne comptent pas en "non lu") ; les conversations privées ne sont pas
    // limitées par la date d'adhésion.
    const received = await this.prisma.message.findMany({
      where: {
        ...(citeId ? { cite_id: citeId } : {}),
        is_deleted: false,
        OR: citeId
          ? [
              { destinataire_id: userId },
              { expediteur_id: userId },
              {
                est_groupe: true,
                ...(citizenSince
                  ? { created_at: { gte: citizenSince } }
                  : {}),
              },
            ]
          : [{ destinataire_id: userId }, { expediteur_id: userId }],
      },
      orderBy: { created_at: 'desc' },
      take: 200,
      select: {
        id: true,
        expediteur_id: true,
        destinataire_id: true,
        groupe_id: true,
        est_groupe: true,
        created_at: true,
      },
    });

    const readIds = await this.redis.smembers(`${READ_PREFIX}${userId}`);
    const readSet = new Set(readIds);

    const map = new Map<string, any>();
    for (const m of received) {
      let key: string;
      let otherId: string | null = null;
      if (m.est_groupe) {
        key = GROUPE_THREAD_ID;
      } else {
        otherId = m.expediteur_id === userId ? m.destinataire_id! : m.expediteur_id;
        if (!otherId) continue;
        key = otherId;
      }
      const isMine = m.expediteur_id === userId;
      const isUnread = !isMine && !readSet.has(m.id);

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          thread_id: key,
          est_groupe: m.est_groupe,
          other_user_id: m.est_groupe ? null : otherId,
          last_message_id: m.id,
          last_message_at: m.created_at,
          unread_count: isUnread ? 1 : 0,
        });
      } else {
        existing.unread_count += isUnread ? 1 : 0;
      }
    }

    const list = Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime(),
    );

    const otherIds = list
      .filter((e) => e.other_user_id)
      .map((e) => e.other_user_id as string);
    const contacts = otherIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: otherIds } },
          select: { id: true, prenom: true, nom: true },
        })
      : [];
    const contactById = new Map(contacts.map((c) => [c.id, c]));

    const cite = citeId
      ? await this.prisma.cite.findFirst({
          where: { id: citeId, is_deleted: false },
          select: { nom: true },
        })
      : null;
    const groupName = cite?.nom ?? 'Groupe de la cité';

    const onlineMap = this.chat.areOnline(otherIds);

    return list.map((e) => ({
      ...e,
      en_ligne: e.est_groupe ? false : !!onlineMap[e.other_user_id],
      contact: e.est_groupe ? null : contactById.get(e.other_user_id) ?? null,
      group_name: e.est_groupe ? groupName : null,
    }));
  }

  /** Présence des utilisateurs (messagerie) : { userId: true|false }. */
  presence(userIds: string[]): Record<string, boolean> {
    return this.chat.areOnline(userIds);
  }

  async getThread(citeId: string | null, userId: string, otherUserId: string) {
    const isGroupe = otherUserId === GROUPE_THREAD_ID;
    // Un membre ne voit que les messages de groupe postérieurs à son adhésion.
    const citizenSince = isGroupe
      ? await this.getCitizenSince(citeId, userId)
      : null;
    const messages = await this.prisma.message.findMany({
      where: {
        ...(citeId ? { cite_id: citeId } : {}),
        is_deleted: false,
        ...(isGroupe
          ? {
              est_groupe: true,
              ...(citizenSince ? { created_at: { gte: citizenSince } } : {}),
            }
          : {
              OR: [
                { expediteur_id: userId, destinataire_id: otherUserId },
                { expediteur_id: otherUserId, destinataire_id: userId },
              ],
            }),
      },
      orderBy: { created_at: 'desc' as const },
      take: 100,
    });

    const ids = messages.map((m) => m.id);
    const contents = ids.length ? await this.content.getContents(ids) : [];
    const contentById = new Map(contents.map((c) => [c.message_id, c.contenu]));

    const expediteurIds = [...new Set(messages.map((m) => m.expediteur_id))];
    const expediteurs = expediteurIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: expediteurIds } },
          select: {
            id: true,
            prenom: true,
            nom: true,
            user_profil: {
              where: citeId
                ? { cite_id: citeId, is_active: true, is_deleted: false }
                : { is_active: true, is_deleted: false },
              orderBy: { order_priority: 'asc' },
              select: { profil: { select: { code: true, libelle: true } } },
            },
          },
        })
      : [];
    const expediteurById = new Map(expediteurs.map((u) => [u.id, u]));

    const readSet = new Set(
      await this.redis.smembers(`${READ_PREFIX}${userId}`),
    );

    return messages.map((m) => {
      const exp = expediteurById.get(m.expediteur_id);
      return {
        id: m.id,
        cite_id: m.cite_id,
        expediteur_id: m.expediteur_id,
        destinataire_id: m.destinataire_id,
        est_groupe: m.est_groupe,
        contenu: contentById.get(m.id) ?? null,
        lu: m.expediteur_id === userId || readSet.has(m.id),
        created_at: m.created_at,
        expediteur: {
          id: m.expediteur_id,
          prenom: exp?.prenom ?? '',
          nom: exp?.nom ?? '',
          roles: exp?.user_profil.map((up) => up.profil.code) ?? [],
        },
      };
    });
  }

  async getContacts(citeId: string | null, userId: string) {
    // Super admin global (sans cité) : il contacte les gestionnaires des cités
    // (syndic / admin / chef sécurité) rattachés à une cité active.
    const users = citeId
      ? await this.prisma.user.findMany({
          where: {
            cite_id: citeId,
            is_active: true,
            is_deleted: false,
            id: { not: userId },
          },
          orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
          select: {
            id: true,
            prenom: true,
            nom: true,
            user_profil: {
              where: { cite_id: citeId, is_active: true, is_deleted: false },
              orderBy: { order_priority: 'asc' },
              select: { profil: { select: { code: true, libelle: true } } },
            },
            user_villa: {
              where: {
                is_current: true,
                is_deleted: false,
                revoked_at: null,
                cite_id: citeId,
              },
              select: {
                villa: {
                  select: { id: true, numero: true, rue: true, is_deleted: true },
                },
              },
            },
          },
        })
      : await this.prisma.user.findMany({
          where: {
            is_active: true,
            is_deleted: false,
            id: { not: userId },
            cite_id: { not: null },
            user_profil: {
              some: {
                is_active: true,
                is_deleted: false,
                cite_id: { not: null },
                profil: {
                  code: { in: ['SYNDIC', 'ADMIN', 'CHEF_SECURITE'] },
                },
              },
            },
          },
          orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
          select: {
            id: true,
            prenom: true,
            nom: true,
            user_profil: {
              where: { is_active: true, is_deleted: false },
              orderBy: { order_priority: 'asc' },
              select: {
                profil: { select: { code: true, libelle: true } },
                cite: { select: { nom: true } },
              },
            },
            cite: { select: { nom: true } },
          },
        });

    // Un membre de cité peut aussi joindre les super-admins globaux
    // (profil SUPER_ADMIN, cite_id NULL) — support de la plateforme.
    const superAdmins = citeId
      ? await this.prisma.user.findMany({
          where: {
            id: { not: userId },
            cite_id: null,
            is_active: true,
            is_deleted: false,
            user_profil: {
              some: {
                is_active: true,
                is_deleted: false,
                profil: { code: 'SUPER_ADMIN', is_deleted: false },
              },
            },
          },
          orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
          select: {
            id: true,
            prenom: true,
            nom: true,
            user_profil: {
              where: { is_active: true, is_deleted: false },
              orderBy: { order_priority: 'asc' },
              select: { profil: { select: { code: true, libelle: true } } },
            },
          },
        })
      : [];

    const PRIORITY: Record<string, number> = {
      SUPER_ADMIN: -1,
      SYNDIC: 0,
      ADMIN: 1,
      CHEF_SECURITE: 2,
      HABITANT: 3,
    };

    return [...users, ...superAdmins]
      .map((u) => {
        const roles = (u as any).user_profil.map((up: any) => up.profil);
        const priority = Math.min(
          ...roles.map((r: any) => PRIORITY[r.code] ?? 4),
          4,
        );
        // Pour le SA, on indique la cité du gestionnaire (sous-titre).
        const cites =
          citeId || !(u as any).cite
            ? []
            : [...new Set((u as any).user_profil.map((up: any) => up.cite?.nom).filter(Boolean))];
        const villas = ((u as any).user_villa ?? [])
          .map((uv: any) => uv.villa)
          .filter((v: any) => v && !v.is_deleted)
          .map((v: any) => ({ id: v.id, numero: v.numero, rue: v.rue }));
        return {
          id: u.id,
          prenom: u.prenom,
          nom: u.nom,
          roles,
          villa: villas[0] ?? null,
          villas,
          priority,
          cites,
        };
      })
      .sort((a, b) => a.priority - b.priority);
  }

  async markRead(citeId: string | null, userId: string, messageId: string) {
    const msg = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        ...(citeId ? { cite_id: citeId } : {}),
        is_deleted: false,
      },
    });
    if (!msg) throw new NotFoundException('Message introuvable');
    if (
      !msg.est_groupe &&
      msg.destinataire_id !== userId &&
      msg.expediteur_id !== userId
    ) {
      throw new ForbiddenException("Vous n'êtes pas concerné par ce message");
    }
    const ttlDays = Number(process.env.REDIS_MSG_LU_TTL_DAYS || 30);
    await this.redis.sadd(`${READ_PREFIX}${userId}`, messageId);
    await this.redis.expire(`${READ_PREFIX}${userId}`, ttlDays * 86400);

    const luPayload = { message_id: messageId, user_id: userId };
    if (msg.expediteur_id) this.chat.emitToUser(msg.expediteur_id, 'message:lu', luPayload);
    if (msg.destinataire_id) this.chat.emitToUser(msg.destinataire_id, 'message:lu', luPayload);

    return { ok: true };
  }

  /**
   * Marque comme lus tous les messages reçus d'un thread (privé ou groupe).
   * Renvoie le nombre de messages effectivement marqués.
   */
  async markThreadRead(citeId: string | null, userId: string, threadId: string) {
    const isGroupe = threadId === GROUPE_THREAD_ID;
    const scope = {
      ...(citeId ? { cite_id: citeId } : {}),
      is_deleted: false,
      NOT: { expediteur_id: userId },
    };
    const where = isGroupe
      ? { ...scope, est_groupe: true }
      : {
          ...scope,
          OR: [
            { expediteur_id: threadId, destinataire_id: userId },
            { expediteur_id: userId, destinataire_id: threadId },
          ],
        };

    const messages = await this.prisma.message.findMany({
      where,
      select: { id: true },
    });
    if (!messages.length) return { ok: true, count: 0 };

    const ttlDays = Number(process.env.REDIS_MSG_LU_TTL_DAYS || 30);
    const key = `${READ_PREFIX}${userId}`;
    await this.redis.sadd(key, ...messages.map((m) => m.id));
    await this.redis.expire(key, ttlDays * 86400);

    return { ok: true, count: messages.length };
  }

  async removeMessage(citeId: string | null, userId: string, messageId: string) {
    const msg = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        ...(citeId ? { cite_id: citeId } : {}),
        is_deleted: false,
      },
    });
    if (!msg) throw new NotFoundException('Message introuvable');
    if (msg.expediteur_id !== userId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos messages');
    }
    return this.prisma.message.update({
      where: { id: messageId },
      data: { is_deleted: true, deleted_at: new Date(), deleted_by: userId },
    });
  }
}