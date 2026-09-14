import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifService } from '../../common/services/notif.service';
import { ChatGateway } from '../../sockets/chat.gateway';
import { UploadService, isUploadEmpty } from '../../common/services/upload.service';
import { CreateAlerteDto } from './dto/create-alerte.dto';
import { UpdateStatutAlerteDto, ResoudreAlerteDto } from './dto/update-alerte.dto';

const STATUT_ALERTE_RECUE = 10;
const STATUT_ALERTE_RESOLUE = 13;

@Injectable()
export class AlerteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotifService,
    private readonly upload: UploadService,
    private readonly chat: ChatGateway,
  ) {}

  // Chemin objet de la photo d'une alerte (pour le stream image)
  async getPhotoPath(id: string, citeId: string): Promise<string | null> {
    const alerte = await this.prisma.alerte_securite.findFirst({
      where: { id, cite_id: citeId, is_deleted: false },
      select: { photo_file_path: true },
    });
    return alerte?.photo_file_path ?? null;
  }

  async create(
    citeId: string,
    habitantId: string,
    dto: CreateAlerteDto,
    photo?: Express.Multer.File,
  ) {
    if (dto.villa_id) {
      const villa = await this.prisma.villa.findFirst({
        where: { id: dto.villa_id, cite_id: citeId, is_deleted: false },
      });
      if (!villa) throw new ForbiddenException('Villa hors de votre cité');
    }
    const photoFile =
      photo && !isUploadEmpty(photo)
        ? await this.upload.uploadPhoto(citeId, 'alertes', photo)
        : null;

    // Multipart → champs string. Conversion explicite + validation métier.
    const motifId = dto.motif_id !== undefined && dto.motif_id !== ''
      ? parseInt(dto.motif_id, 10)
      : undefined;
    if (motifId !== undefined && Number.isNaN(motifId)) {
      throw new BadRequestException({
        code: 'MOTIF_ID_INVALIDE',
        message: 'Le champ motif_id doit être un entier.',
      });
    }
    const silencieuse =
      dto.silencieuse === true || String(dto.silencieuse).toLowerCase() === 'true';

    const alerte = await this.prisma.alerte_securite.create({
      data: {
        cite_id: citeId,
        habitant_id: habitantId,
        villa_id: dto.villa_id ?? null,
        motif_id: motifId ?? null,
        description: dto.description ?? null,
        photo_file_path: photoFile ?? dto.photo_file_path ?? null,
        silencieuse,
        statut_id: STATUT_ALERTE_RECUE,
        escalade: false,
        created_at: new Date(),
        created_by: habitantId,
      },
      include: {
        motif_alerte: { select: { id: true, libelle: true, code: true } },
        statut_alerte: { select: { id: true, libelle: true, code: true } },
        villa: { select: { id: true, numero: true, rue: true } },
      },
    });
    if (!silencieuse) {
      await this.notif.sendToCite(
        citeId,
        'Alerte sécurité',
        dto.description ?? 'Alerte signalée dans votre cité',
        {
          features: ['ALERTE_UPDATE_STATUT'],
          exceptUserId: habitantId,
          typeId: 3,
          data: { alerte_id: alerte.id },
        },
      );
      this.chat.emitToCite(citeId, 'alerte:nouvelle', { alerte });
    }
    return alerte;
  }

  async findActives(citeId: string) {
    return this.prisma.alerte_securite.findMany({
      where: { cite_id: citeId, is_deleted: false, statut_id: { not: STATUT_ALERTE_RESOLUE } },
      orderBy: { created_at: 'desc' as const },
      include: {
        motif_alerte: { select: { id: true, libelle: true, code: true } },
        statut_alerte: { select: { id: true, libelle: true, code: true } },
        villa: { select: { id: true, numero: true, rue: true } },
      },
    });
  }

  async findHistorique(citeId: string) {
    return this.prisma.alerte_securite.findMany({
      where: { cite_id: citeId, is_deleted: false },
      orderBy: { created_at: 'desc' as const },
      include: {
        motif_alerte: { select: { id: true, libelle: true, code: true } },
        statut_alerte: { select: { id: true, libelle: true, code: true } },
        villa: { select: { id: true, numero: true, rue: true } },
      },
    });
  }

  /**
   * Alertes DÉCLARÉES PAR l'habitant connecté (toutes cités) — suivi perso.
   * Accessible à tout profil connecté, sans feature sécurité : un habitant
   * doit pouvoir suivre ses propres signalements.
   */
  async mesAlertes(habitantId: string, page: number, size: number) {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(50, Math.max(1, size));
    const where = { habitant_id: habitantId, is_deleted: false };
    const [total, items] = await Promise.all([
      this.prisma.alerte_securite.count({ where }),
      this.prisma.alerte_securite.findMany({
        where,
        orderBy: { created_at: 'desc' as const },
        skip: (safePage - 1) * safeSize,
        take: safeSize,
        include: {
          motif_alerte: { select: { id: true, libelle: true, code: true } },
          statut_alerte: { select: { id: true, libelle: true, code: true } },
          villa: { select: { id: true, numero: true, rue: true } },
          cite: { select: { id: true, nom: true } },
        },
      }),
    ]);
    return {
      items,
      total,
      page: safePage,
      size: safeSize,
      pages: Math.max(1, Math.ceil(total / safeSize)),
    };
  }

  async findOne(id: string, citeId: string) {
    const alerte = await this.prisma.alerte_securite.findFirst({
      where: { id, cite_id: citeId, is_deleted: false },
      include: {
        motif_alerte: { select: { id: true, libelle: true, code: true } },
        statut_alerte: { select: { id: true, libelle: true, code: true } },
        villa: { select: { id: true, numero: true, rue: true } },
      },
    });
    if (!alerte) throw new NotFoundException('Alerte introuvable');
    return alerte;
  }

  async updateStatut(id: string, citeId: string, syndicId: string, dto: UpdateStatutAlerteDto) {
    const alerte = await this.findOne(id, citeId);
    const escalade = dto.escalade === true && !alerte.escalade;
    const updated = await this.prisma.alerte_securite.update({
      where: { id },
      data: {
        statut_id: dto.statut_id,
        ...(escalade && { escalade: true, escalade_at: new Date() }),
        updated_at: new Date(),
        updated_by: syndicId,
      },
      include: {
        motif_alerte: { select: { id: true, libelle: true, code: true } },
        statut_alerte: { select: { id: true, libelle: true, code: true } },
      },
    });
    this.chat.emitToCite(citeId, 'alerte:statut', {
      alerte_id: updated.id,
      statut_id: updated.statut_id,
    });
    if (escalade) {
      this.chat.emitToCite(citeId, 'alerte:escaladee', {
        alerte_id: updated.id,
        escalade_at: updated.escalade_at,
      });
      await this.notifyEscalade(citeId, updated);
    }
    return updated;
  }

  /**
   * Escalade chef de sécurité → urgence : notifier les syndics de la cité
   * et les super-admins globaux (profil SUPER_ADMIN, cite_id NULL).
   */
  private async notifyEscalade(citeId: string, alerte: { id: string; description?: string | null }) {
    const [syndics, superAdmins] = await Promise.all([
      this.prisma.user_profil.findMany({
        where: {
          cite_id: citeId,
          is_active: true,
          is_deleted: false,
          profil: { code: 'SYNDIC', is_deleted: false },
        },
        select: { user_id: true },
      }),
      this.prisma.user_profil.findMany({
        where: {
          is_active: true,
          is_deleted: false,
          profil: { code: 'SUPER_ADMIN', is_deleted: false },
        },
        select: { user_id: true },
      }),
    ]);

    const ids = [...new Set([...syndics, ...superAdmins].map((x) => x.user_id))];
    const message = alerte.description ?? 'Une alerte de sécurité a été escaladée par le chef de sécurité.';

    await Promise.all(
      ids.map((userId) =>
        this.notif.sendToUser({
          cite_id: citeId,
          user_id: userId,
          titre: 'Alerte escaladée en urgence',
          message,
          typeId: 4,
          data: { alerte_id: alerte.id },
        }),
      ),
    );
    this.chat.emitToCite(citeId, 'alerte:escaladee-syndic', {
      alerte_id: alerte.id,
      message,
    });
  }

  async resoudre(id: string, citeId: string, syndicId: string, dto: ResoudreAlerteDto) {
    await this.findOne(id, citeId);
    const alerte = await this.prisma.alerte_securite.update({
      where: { id },
      data: {
        statut_id: STATUT_ALERTE_RESOLUE,
        resolu_par: syndicId,
        resolu_at: new Date(),
        ...(dto.description !== undefined && { description: dto.description }),
        updated_at: new Date(),
        updated_by: syndicId,
      },
      include: {
        motif_alerte: { select: { id: true, libelle: true, code: true } },
        statut_alerte: { select: { id: true, libelle: true, code: true } },
      },
    });
    await this.notif.sendToUser({
      cite_id: citeId,
      user_id: alerte.habitant_id,
      titre: 'Alerte résolue',
      message: 'Votre alerte sécurité a été traitée.',
    });
    this.chat.emitToCite(citeId, 'alerte:statut', {
      alerte_id: alerte.id,
      statut_id: alerte.statut_id,
    });
    return alerte;
  }

  // ── Listes de référence ────────────────────────────────────
  async getMotifs() {
    return this.prisma.motif_alerte.findMany({
      where: { is_deleted: false },
      select: { id: true, libelle: true, code: true },
      orderBy: { libelle: 'asc' },
    });
  }

  async getStatuts() {
    return this.prisma.statut_alerte.findMany({
      where: { is_deleted: false },
      select: { id: true, libelle: true, code: true },
      orderBy: { id: 'asc' },
    });
  }
}