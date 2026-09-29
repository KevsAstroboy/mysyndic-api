import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifService } from '../../common/services/notif.service';
import { CreateVillaDto, UpdateVillaDto, AssignUserDto } from './dto/villa.dto';

const CODE_PENDING = 'VILLA_OCCUPATION_EN_ATTENTE';
const CODE_INDISPONIBLE = 'VILLA_EN_COURS_ATTRIBUTION';

@Injectable()
export class VillaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotifService,
  ) {}

  // ── Liste / détail ─────────────────────────────────────────
  // GET /villas — liste villa (citée active ; SA sans cité = toutes les cités)
  async findAll(citeId: string | null) {
    return this.prisma.villa.findMany({
      where: {
        ...(citeId ? { cite_id: citeId } : {}),
        is_deleted: false,
      },
      orderBy: { numero: 'asc' },
    });
  }

  // GET /villas/:id — détail + occupants + historique paiements
  async findOne(id: string, citeId: string | null) {
    const villa = await this.prisma.villa.findFirst({
      where: { id, is_deleted: false, ...(citeId ? { cite_id: citeId } : {}) },
    });
    if (!villa) throw new NotFoundException('Villa introuvable');

    const [occupants, paiements] = await Promise.all([
      this.prisma.user_villa.findMany({
        where: { villa_id: id, cite_id: villa.cite_id, is_current: true, is_deleted: false },
        include: {
          user: {
            select: {
              id: true,
              prenom: true,
              nom: true,
              email: true,
              telephone: true,
              is_active: true,
            },
          },
        },
      }),
      this.prisma.paiement.findMany({
        where: { villa_id: id, cite_id: villa.cite_id, is_deleted: false },
        orderBy: { created_at: 'desc' },
        take: 20,
      }),
    ]);

    return {
      ...villa,
      occupants: occupants.map((o) => o.user),
      paiements_historique: paiements,
    };
  }

  // POST /villas
  async create(citeId: string | null, dto: CreateVillaDto) {
    if (!citeId) {
      throw new BadRequestException({ code: 'CITE_REQUISE', message: 'Une cité est requise pour créer une villa' });
    }
    const existing = await this.prisma.villa.findFirst({
      where: { cite_id: citeId, numero: dto.numero, is_deleted: false },
    });
    if (existing) {
      throw new ConflictException({ code: 'VILLA_NUMERO_EXISTE', message: 'Ce numéro de villa existe déjà dans la cité' });
    }

    return this.prisma.villa.create({
      data: {
        cite_id: citeId,
        numero: dto.numero,
        rue: dto.rue,
        description: dto.description,
        is_active: true,
        created_at: new Date(),
      },
    });
  }

  // PATCH /villas/:id
  async update(id: string, citeId: string | null, dto: UpdateVillaDto) {
    if (!citeId) {
      throw new BadRequestException({ code: 'CITE_REQUISE', message: 'Une cité est requise pour modifier une villa' });
    }
    await this.findOne(id, citeId);

    if (dto.numero) {
      const existing = await this.prisma.villa.findFirst({
        where: {
          cite_id: citeId,
          numero: dto.numero,
          id: { not: id },
          is_deleted: false,
        },
      });
      if (existing) {
        throw new ConflictException({ code: 'VILLA_NUMERO_EXISTE', message: 'Ce numéro de villa existe déjà dans la cité' });
      }
    }

    return this.prisma.villa.update({
      where: { id },
      data: {
        ...(dto.numero !== undefined && { numero: dto.numero }),
        ...(dto.rue !== undefined && { rue: dto.rue }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.is_active !== undefined && { is_active: dto.is_active }),
        updated_at: new Date(),
      },
    });
  }

  // DELETE /villas/:id — suppression douce depuis la gestion super admin.
  async remove(villaId: string, citeId: string, actorId: string) {
    const villa = await this.prisma.villa.findFirst({
      where: { id: villaId, cite_id: citeId, is_deleted: false },
    });
    if (!villa) throw new NotFoundException('Villa introuvable');

    await this.prisma.$transaction(async (tx) => {
      // Détache les occupants courants (soft revoke) pour libérer les comptes rattachés.
      await tx.user_villa.updateMany({
        where: { villa_id: villaId, cite_id: citeId, is_current: true, is_deleted: false },
        data: {
          is_current: false,
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by: actorId,
          revoked_at: new Date(),
          revoked_by: actorId,
          updated_at: new Date(),
          updated_by: actorId,
        },
      });

      await tx.villa.update({
        where: { id: villaId },
        data: {
          is_active: false,
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by: actorId,
          updated_at: new Date(),
          updated_by: actorId,
        },
      });

      await tx.audit_log.create({
        data: {
          cite_id: citeId,
          user_id: actorId,
          profil_actif_code: 'SUPER_ADMIN',
          action: 'DELETE',
          entite: 'villa',
          entite_id: villaId,
          created_at: new Date(),
        } as any,
      });
    });

    return { message: 'Villa supprimée' };
  }

  // POST /villas/:id/assign-user — attribution directe par l'admin (confirmée)
  async assignUser(villaId: string, citeId: string | null, dto: AssignUserDto, actorId: string) {
    if (!citeId) {
      throw new BadRequestException({ code: 'CITE_REQUISE', message: 'Une cité est requise pour assigner un utilisateur' });
    }
    const villa = await this.prisma.villa.findFirst({
      where: { id: villaId, cite_id: citeId, is_deleted: false },
    });
    if (!villa) throw new NotFoundException('Villa introuvable');

    const user = await this.prisma.user.findFirst({
      where: { id: dto.user_id, is_deleted: false },
    });
    if (!user) throw new BadRequestException('Utilisateur introuvable');

    // User d'une AUTRE cité : on n'attribue pas directement, on dépose une
    // candidature soumise aux colocations (si villa occupée) ou au syndic
    // (si première occupation) — l'adhésion doit être acceptée ou refusée.
    if (user.cite_id !== citeId) {
      const created = await this.candidater(user.id, villaId, actorId);
      await this.notif.sendToUser({
        cite_id: citeId,
        user_id: user.id,
        titre: 'Candidature déposée pour vous',
        message: `Une candidature a été déposée pour la villa ${villa.numero} à votre nom. Elle reste à valider par les occupants ou le syndic.`,
        data: { villa_id: villaId, user_villa_id: created.user_villa_id },
      });
      return { ...created, message: 'Candidature déposée — en attente de validation par les occupants ou le syndic.' };
    }

    return this.prisma.$transaction(async (tx) => {
      // Une villa courante par (user, cité) : on ne révoque que la courante
      // de la cité cible, jamais celles des autres cités (multi-cité simultané).
      await tx.user_villa.updateMany({
        where: { user_id: dto.user_id, cite_id: citeId, is_current: true, is_deleted: false },
        data: { is_current: false, revoked_at: new Date(), revoked_by: actorId, updated_at: new Date() },
      });

      const [uv] = await Promise.all([
        tx.user_villa.create({
          data: {
            user_id: dto.user_id,
            villa_id: villaId,
            cite_id: citeId,
            is_current: true,
            is_confirme: true,
            assigned_at: new Date(),
            assigned_by: actorId,
            created_at: new Date(),
          },
        }),
        tx.audit_log.create({
          data: {
            cite_id: citeId,
            user_id: actorId,
            action: 'CREATE',
            entite: 'user_villa',
            entite_id: villaId,
            created_at: new Date(),
          } as any,
        }),
      ]);

      return uv;
    });
  }

  // DELETE /villas/:id/unassign-user
  async unassignUser(villaId: string, citeId: string | null, userId: string, actorId: string) {
    if (!citeId) {
      throw new BadRequestException({ code: 'CITE_REQUISE', message: 'Une cité est requise pour désassigner un utilisateur' });
    }
    const villa = await this.prisma.villa.findFirst({
      where: { id: villaId, cite_id: citeId, is_deleted: false },
    });
    if (!villa) throw new NotFoundException('Villa introuvable');

    return this.prisma.$transaction(async (tx) => {
      await tx.user_villa.updateMany({
        where: { user_id: userId, villa_id: villaId, is_current: true, is_deleted: false },
        data: { is_current: false, revoked_at: new Date(), revoked_by: actorId, updated_at: new Date() },
      });
      await tx.audit_log.create({
        data: {
          cite_id: citeId,
          user_id: actorId,
          action: 'UPDATE',
          entite: 'user_villa',
          entite_id: villaId,
          created_at: new Date(),
        } as any,
      });
      return { message: 'Utilisateur désassigné' };
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Occupations & candidatures
  // ═══════════════════════════════════════════════════════════

  /** État d'une villa dérivé de user_villa (jamais du token). */
  async occupationStatut(villaId: string): Promise<{
    statut: 'libre' | 'en_attente' | 'occupee';
    a_pending: boolean;
    nb_confirmees: number;
  }> {
    const rows = await this.prisma.user_villa.findMany({
      where: { villa_id: villaId, is_current: true, is_deleted: false },
      select: { is_confirme: true },
    });
    const aPending = rows.some((r) => r.is_confirme === false);
    const nbConfirmees = rows.filter((r) => r.is_confirme === true).length;
    // « en_attente » = villa libre avec une 1re candidature non résolue (réservation).
    // Une villa occupée reste ouverte aux candidatures colocataires, même si
    // d'autres candidatures colocataires sont déjà en attente.
    const statut: 'libre' | 'en_attente' | 'occupee' =
      nbConfirmees > 0 ? 'occupee' : aPending ? 'en_attente' : 'libre';
    return { statut, a_pending: aPending, nb_confirmees: nbConfirmees };
  }

  private async assertVillaCandidatable(villaId: string) {
    const { statut } = await this.occupationStatut(villaId);
    if (statut === 'en_attente') {
      throw new ConflictException({
        code: CODE_INDISPONIBLE,
        message: 'Une candidature est déjà en cours pour cette villa.',
      });
    }
  }

  /** Endpoint public pour la disponibilité (register). */
  async assertCandidatureOuverte(villaId: string): Promise<void> {
    await this.assertVillaCandidatable(villaId);
  }

  /** Candidature à une occupation (libre -> 1re occ ; occupée -> colocataire). */
  async candidater(userId: string, villaId: string, acteurId?: string) {
    const villa = await this.prisma.villa.findFirst({
      where: { id: villaId, is_deleted: false },
    });
    if (!villa) throw new NotFoundException('Villa introuvable');

    // Déjà lié à une villa (pending ou confirmée) dans cette cité ?
    const dejaLie = await this.prisma.user_villa.findFirst({
      where: { user_id: userId, cite_id: villa.cite_id, is_current: true, is_deleted: false },
      select: { id: true },
    });
    if (dejaLie) {
      throw new ConflictException({
        code: 'VILLA_DEJA_LIEE',
        message: 'Vous avez déjà une villa (en attente ou confirmée) dans cette cité.',
      });
    }

    // L'index idx_user_villa_unique_current est unique PAR (user, cite) :
    // on peut être occupant courant dans plusieurs cités simultanément.

    await this.assertVillaCandidatable(villa.id);
    const { nb_confirmees } = await this.occupationStatut(villa.id);
    const estColocataire = nb_confirmees > 0;

    const profilHabitant = await this.prisma.profil.findFirst({
      where: { code: 'HABITANT', is_deleted: false },
    });
    if (!profilHabitant) throw new BadRequestException('Profil HABITANT introuvable');

    const uv = await this.prisma.$transaction(async (tx) => {
      // Profil HABITANT dans la cité cible (cross-cité : même compte).
      // L'index partiel idx_user_profil_default impose un seul profil actif
      // order_priority=1 par user -> on choisit la prochaine priorité libre.
      const actifs = await tx.user_profil.findMany({
        where: { user_id: userId, is_active: true, is_deleted: false },
        select: { order_priority: true, id: true, cite_id: true },
      });
      const aDejaP1 = actifs.some((p) => p.order_priority === 1);
      const maxP = actifs.reduce((m, p) => Math.max(m, p.order_priority), 0);
      const priorite = !aDejaP1 ? 1 : Math.min(maxP + 1, 10);

      await tx.user_profil.upsert({
        where: {
          user_id_profil_id_cite_id: {
            user_id: userId,
            profil_id: profilHabitant.id,
            cite_id: villa.cite_id,
          },
        },
        create: {
          user_id: userId,
          profil_id: profilHabitant.id,
          cite_id: villa.cite_id,
          order_priority: priorite,
          is_active: true,
          assigned_at: new Date(),
          created_at: new Date(),
        },
        update: { is_active: true, is_deleted: false, updated_at: new Date() },
      });

      // Cité désactivée : on n'ajoute personne de plus (gate anti-ajout).
      const citeActive = await tx.cite.findUnique({
        where: { id: villa.cite_id },
        select: { is_active: true },
      });
      if (!citeActive || citeActive.is_active === false) {
        throw new ConflictException({
          code: 'CITE_INACTIVE',
          message: "Cette cité a été désactivée, l'ajout d'occupants est suspendu.",
        });
      }

      await tx.$executeRawUnsafe(
        'CALL add_user_to_cite_groupe($1::uuid, $2::uuid)',
        userId,
        villa.cite_id,
      );

      const created = await tx.user_villa.create({
        data: {
          user_id: userId,
          villa_id: villa.id,
          cite_id: villa.cite_id,
          is_current: true,
          is_confirme: false,
          assigned_at: new Date(),
          assigned_by: acteurId ?? userId,
          created_at: new Date(),
        },
      });
      await tx.audit_log.create({
        data: {
          cite_id: villa.cite_id,
          user_id: acteurId ?? userId,
          profil_actif_code: 'HABITANT',
          action: 'CREATE',
          entite: 'user_villa',
          entite_id: villa.id,
          created_at: new Date(),
        } as any,
      });
      return created;
    });

    // Notifications
    if (estColocataire) {
      const occupants = await this.confirmedOccupantIds(villa.id);
      await Promise.all(
        occupants
          .filter((id) => id !== userId)
          .map((id) =>
            this.notif.sendToUser({
              cite_id: villa.cite_id,
              user_id: id,
              titre: 'Demande de colocation',
              message: `Un habitant demande à rejoindre la villa ${villa.numero}. Validez ou refusez sa candidature.`,
              data: { villa_id: villa.id, user_villa_id: uv.id },
            }),
          ),
      );
    } else {
      await this.notif.sendToCite(villa.cite_id, 'Candidature d\'occupation', `Un habitant demande la villa ${villa.numero} (première occupation).`, {
        features: ['VILLA_GERER_CANDIDATURES'],
        exceptUserId: userId,
      });
    }

    return { user_villa_id: uv.id, occupation_en_attente: true };
  }

  // ── Circuit syndic (première occupation) ────────────────────
  /** Mes candidatures en attente (toutes cités confondues). */
  async mesCandidatures(userId: string) {
    return this.prisma.user_villa.findMany({
      where: { user_id: userId, is_current: true, is_deleted: false, is_confirme: false },
      include: {
        villa: { select: { id: true, numero: true, rue: true } },
        cite: { select: { id: true, nom: true, ville: true, pays: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  private async isFirstOccupation(userVillaId: string, citeId: string) {
    const row = await this.prisma.user_villa.findFirst({
      where: { id: userVillaId, cite_id: citeId, is_current: true, is_deleted: false },
      include: { villa: { select: { id: true, numero: true, cite_id: true } } },
    });
    if (!row) throw new NotFoundException('Candidature introuvable');
    const { statut } = await this.occupationStatut(row.villa_id);
    const aConfirme = (await this.countConfirmed(row.villa_id)) > 0;
    if (statut !== 'en_attente' || row.is_confirme !== false || aConfirme) {
      throw new BadRequestException({ code: CODE_PENDING, message: 'Cette candidature n\'est pas en attente de première occupation.' });
    }
    return row;
  }

  /** Candidatures de première occupation (villa sans occupant confirmé). */
  async listCandidaturesPremiere(citeId: string) {
    const pendantes = await this.prisma.user_villa.findMany({
      where: { cite_id: citeId, is_current: true, is_deleted: false, is_confirme: false },
      include: {
        villa: { select: { id: true, numero: true, rue: true } },
        user: { select: { id: true, prenom: true, nom: true, email: true, telephone: true } },
      },
      orderBy: { created_at: 'asc' },
    });
    const result: any[] = [];
    for (const row of pendantes) {
      const { statut } = await this.occupationStatut(row.villa_id);
      if (statut === 'en_attente' && (await this.countConfirmed(row.villa_id)) === 0) {
        result.push({ user_villa_id: row.id, villa: row.villa, user: row.user, created_at: row.created_at });
      }
    }
    return result;
  }

  private async countConfirmed(villaId: string) {
    return this.prisma.user_villa.count({
      where: { villa_id: villaId, is_current: true, is_deleted: false, is_confirme: true },
    });
  }

  private async confirmRow(userVillaId: string, actor: { id: string; cite_id: string }, label: string) {
    const row = await this.prisma.user_villa.findFirst({
      where: { id: userVillaId, cite_id: actor.cite_id, is_current: true, is_deleted: false, is_confirme: false },
      include: { villa: { select: { id: true, numero: true } } },
    });
    if (!row) throw new NotFoundException('Candidature introuvable');

    await this.prisma.$transaction(async (tx) => {
      await tx.user_villa.update({
        where: { id: row.id },
        data: { is_confirme: true, updated_at: new Date(), updated_by: actor.id },
      });
      await tx.audit_log.create({
        data: {
          cite_id: row.cite_id,
          user_id: actor.id,
          action: 'UPDATE',
          entite: 'user_villa',
          entite_id: row.villa_id,
          created_at: new Date(),
        } as any,
      });
    });

    await this.notif.sendToUser({
      cite_id: row.cite_id,
      user_id: row.user_id,
      titre: 'Occupation confirmée',
      message: `Votre occupation de la villa ${row.villa.numero} a été confirmée (${label}).`,
      data: { villa_id: row.villa_id },
    });
    return { message: 'Candidature confirmée' };
  }

  private async refuseRow(userVillaId: string, actor: { id: string; cite_id: string }, label: string) {
    const row = await this.prisma.user_villa.findFirst({
      where: { id: userVillaId, cite_id: actor.cite_id, is_current: true, is_deleted: false },
      include: { villa: { select: { id: true, numero: true } } },
    });
    if (!row) throw new NotFoundException('Candidature introuvable');

    await this.prisma.$transaction(async (tx) => {
      await tx.user_villa.update({
        where: { id: row.id },
        data: {
          is_current: false,
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by: actor.id,
          revoked_at: new Date(),
          revoked_by: actor.id,
          updated_at: new Date(),
          updated_by: actor.id,
        },
      });
      await tx.audit_log.create({
        data: {
          cite_id: row.cite_id,
          user_id: actor.id,
          action: 'DELETE',
          entite: 'user_villa',
          entite_id: row.villa_id,
          created_at: new Date(),
        } as any,
      });
    });

    await this.notif.sendToUser({
      cite_id: row.cite_id,
      user_id: row.user_id,
      titre: 'Candidature refusée',
      message: `Votre candidature pour la villa ${row.villa.numero} a été refusée (${label}). Votre compte reste actif.`,
      data: { villa_id: row.villa_id },
    });
    return { message: 'Candidature refusée' };
  }

  async confirmerPremiere(userVillaId: string, actor: { id: string; cite_id: string }) {
    await this.isFirstOccupation(userVillaId, actor.cite_id);
    return this.confirmRow(userVillaId, actor, 'par le syndic');
  }

  async refuserPremiere(userVillaId: string, actor: { id: string; cite_id: string }) {
    await this.isFirstOccupation(userVillaId, actor.cite_id);
    return this.refuseRow(userVillaId, actor, 'par le syndic');
  }

  // ── Circuit colocataires (occupants confirmés de la villa) ──
  private async requireConfirmedOccupant(villaId: string, userId: string, citeId: string) {
    const villa = await this.prisma.villa.findFirst({
      where: { id: villaId, cite_id: citeId, is_deleted: false },
    });
    if (!villa) throw new NotFoundException('Villa introuvable');

    const occupant = await this.prisma.user_villa.findFirst({
      where: {
        user_id: userId,
        villa_id: villaId,
        cite_id: citeId,
        is_current: true,
        is_deleted: false,
        is_confirme: true,
      },
    });
    if (!occupant) {
      throw new ForbiddenException({ code: 'PAS_OCCUPANT_CONFIRME', message: 'Seul un occupant confirmé de cette villa peut effectuer cette action.' });
    }
    return { villa, occupant };
  }

  async listCandidaturesVilla(villaId: string, userId: string, citeId: string) {
    await this.requireConfirmedOccupant(villaId, userId, citeId);
    return this.prisma.user_villa.findMany({
      where: { villa_id: villaId, cite_id: citeId, is_current: true, is_deleted: false, is_confirme: false },
      include: {
        user: { select: { id: true, prenom: true, nom: true, email: true, telephone: true } },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async validerColocataire(villaId: string, userVillaId: string, actor: { id: string; cite_id: string }) {
    await this.requireConfirmedOccupant(villaId, actor.id, actor.cite_id);
    const cand = await this.prisma.user_villa.findFirst({
      where: { id: userVillaId, villa_id: villaId, cite_id: actor.cite_id, is_confirme: false, is_deleted: false },
    });
    if (!cand) throw new NotFoundException('Candidature colocataire introuvable');
    if (cand.user_id === actor.id) throw new BadRequestException('Vous ne pouvez pas valider votre propre candidature');
    return this.confirmRow(userVillaId, actor, 'par les occupants de la villa');
  }

  async refuserColocataire(villaId: string, userVillaId: string, actor: { id: string; cite_id: string }) {
    await this.requireConfirmedOccupant(villaId, actor.id, actor.cite_id);
    const cand = await this.prisma.user_villa.findFirst({
      where: { id: userVillaId, villa_id: villaId, cite_id: actor.cite_id, is_confirme: false, is_deleted: false },
    });
    if (!cand) throw new NotFoundException('Candidature colocataire introuvable');
    return this.refuseRow(userVillaId, actor, 'par les occupants de la villa');
  }

  // ── Gestion des occupants ───────────────────────────────────
  async listOccupants(villaId: string, userId: string, citeId: string) {
    await this.requireConfirmedOccupant(villaId, userId, citeId);
    return this.prisma.user_villa.findMany({
      where: { villa_id: villaId, cite_id: citeId, is_current: true, is_deleted: false, is_confirme: true },
      include: {
        user: { select: { id: true, prenom: true, nom: true, email: true, telephone: true, is_active: true } },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  private async softRevokeUserVilla(rowId: string, actorId: string) {
    await this.prisma.user_villa.update({
      where: { id: rowId },
      data: {
        is_current: false,
        is_deleted: true,
        deleted_at: new Date(),
        deleted_by: actorId,
        revoked_at: new Date(),
        revoked_by: actorId,
        updated_at: new Date(),
        updated_by: actorId,
      },
    });
  }

  /** Retirer un autre occupant confirmé. */
  async retirerOccupant(villaId: string, cibleUserId: string, actor: { id: string; cite_id: string }) {
    await this.requireConfirmedOccupant(villaId, actor.id, actor.cite_id);
    if (cibleUserId === actor.id) throw new BadRequestException('Utilisez « me/partir » pour quitter votre villa.');

    const cible = await this.prisma.user_villa.findFirst({
      where: {
        user_id: cibleUserId,
        villa_id: villaId,
        cite_id: actor.cite_id,
        is_current: true,
        is_deleted: false,
        is_confirme: true,
      },
      include: { villa: { select: { id: true, numero: true } } },
    });
    if (!cible) throw new NotFoundException('Occupant introuvable dans cette villa');

    await this.prisma.$transaction(async (tx) => {
      await tx.user_villa.update({
        where: { id: cible.id },
        data: {
          is_current: false,
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by: actor.id,
          revoked_at: new Date(),
          revoked_by: actor.id,
          updated_at: new Date(),
          updated_by: actor.id,
        },
      });
      await tx.audit_log.create({
        data: {
          cite_id: actor.cite_id,
          user_id: actor.id,
          action: 'DELETE',
          entite: 'user_villa',
          entite_id: villaId,
          created_at: new Date(),
        } as any,
      });
    });

    await this.notif.sendToUser({
      cite_id: actor.cite_id,
      user_id: cibleUserId,
      titre: 'Retrait de la villa',
      message: `Vous avez été retiré de la villa ${cible.villa.numero} par un autre occupant.`,
      data: { villa_id: villaId },
    });
    return { message: 'Occupant retiré' };
  }

  /** Départ volontaire — si dernier occupant confirmé, la villa redevient libre. */
  async mePartir(villaId: string, userId: string, citeId: string) {
    const row = await this.prisma.user_villa.findFirst({
      where: { user_id: userId, villa_id: villaId, cite_id: citeId, is_current: true, is_deleted: false },
    });
    if (!row) throw new NotFoundException('Aucune liaison active à cette villa');

    await this.prisma.$transaction(async (tx) => {
      await tx.user_villa.update({
        where: { id: row.id },
        data: {
          is_current: false,
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by: userId,
          revoked_at: new Date(),
          revoked_by: userId,
          updated_at: new Date(),
          updated_by: userId,
        },
      });
      await tx.audit_log.create({
        data: {
          cite_id: citeId,
          user_id: userId,
          action: 'DELETE',
          entite: 'user_villa',
          entite_id: villaId,
          created_at: new Date(),
        } as any,
      });
    });

    return { message: 'Vous avez quitté la villa' };
  }

  /** Annuler sa propre candidature en attente. */
  async annulerCandidature(villaId: string, userId: string, citeId: string) {
    const row = await this.prisma.user_villa.findFirst({
      where: {
        user_id: userId,
        villa_id: villaId,
        cite_id: citeId,
        is_current: true,
        is_deleted: false,
        is_confirme: false,
      },
      include: { villa: { select: { id: true, numero: true } } },
    });
    if (!row) throw new NotFoundException('Aucune candidature en attente pour cette villa');

    await this.softRevokeUserVilla(row.id, userId);
    await this.audit(row.cite_id, userId, 'DELETE', 'user_villa', villaId);
    return { message: 'Candidature annulée' };
  }

  // ── Découverte publique (onboarding) ────────────────────────
  async listPublicCites() {
    return this.prisma.cite.findMany({
      where: { is_deleted: false, is_active: true },
      select: { id: true, nom: true, ville: true, pays: true },
      orderBy: { nom: 'asc' },
    });
  }

  /** Gestion super admin : villas d'une cité + statut d'occupation + is_active. */
  async listCitesVillas(citeId: string) {
    const cite = await this.prisma.cite.findFirst({
      where: { id: citeId, is_deleted: false },
    });
    if (!cite) throw new NotFoundException('Cité introuvable');

    const villas = await this.prisma.villa.findMany({
      where: { cite_id: citeId, is_deleted: false },
      select: {
        id: true,
        numero: true,
        rue: true,
        description: true,
        is_active: true,
      },
      orderBy: { numero: 'asc' },
    });

    const result: any[] = [];
    for (const villa of villas) {
      const { statut, a_pending, nb_confirmees } = await this.occupationStatut(villa.id);
      result.push({ ...villa, statut, a_pending, nb_occupants_confirmes: nb_confirmees });
    }
    return result;
  }

  async listPublicVillas(citeId: string) {
    const cite = await this.prisma.cite.findFirst({
      where: { id: citeId, is_deleted: false, is_active: true },
    });
    if (!cite) throw new NotFoundException('Cité introuvable');

    const villas = await this.prisma.villa.findMany({
      where: { cite_id: citeId, is_deleted: false },
      select: { id: true, numero: true, rue: true, description: true },
      orderBy: { numero: 'asc' },
    });

    const result: any[] = [];
    for (const villa of villas) {
      const { statut, a_pending, nb_confirmees } = await this.occupationStatut(villa.id);
      result.push({ ...villa, statut, a_pending, nb_occupants_confirmes: nb_confirmees });
    }
    return result;
  }

  // ── Helpers privés ──────────────────────────────────────────
  private async confirmedOccupantIds(villaId: string): Promise<string[]> {
    const rows = await this.prisma.user_villa.findMany({
      where: { villa_id: villaId, is_current: true, is_deleted: false, is_confirme: true },
      select: { user_id: true },
    });
    return rows.map((r) => r.user_id);
  }

  private async audit(citeId: string, userId: string, action: string, entite: string, entiteId: string) {
    await this.prisma.audit_log.create({
      data: {
        cite_id: citeId,
        user_id: userId,
        action,
        entite,
        entite_id: entiteId,
        created_at: new Date(),
      } as any,
    });
  }
}
