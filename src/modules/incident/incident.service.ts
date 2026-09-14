import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifService } from '../../common/services/notif.service';
import { UploadService, isUploadEmpty } from '../../common/services/upload.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { CommentaireDto } from './dto/commentaire.dto';
import {
  PrendreEnChargeIncidentDto,
  ResoudreIncidentDto,
  NoteSyndicIncidentDto,
} from './dto/update-incident.dto';

const STATUT_INCIDENT_SIGNALE = 20;
const STATUT_INCIDENT_EN_COURS = 21;
const STATUT_INCIDENT_RESOLU = 22;

const STATUT_INCIDENT_SELECT = {
  id: true,
  libelle: true,
  code: true,
} as const;

const COMMENTER_SELECT = {
  id: true,
  parent_id: true,
  niveau: true,
  texte: true,
  created_at: true,
  user: { select: { id: true, prenom: true, nom: true } },
} as const;

@Injectable()
export class IncidentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotifService,
    private readonly upload: UploadService,
  ) {}

  async create(
    citeId: string,
    auteurId: string,
    dto: CreateIncidentDto,
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
        ? await this.upload.uploadPhoto(citeId, 'incidents', photo)
        : null;
    const incident = await this.prisma.incident.create({
      data: {
        cite_id: citeId,
        auteur_id: auteurId,
        villa_id: dto.villa_id ?? null,
        categorie_id: dto.categorie_id ?? null,
        titre: dto.titre ?? null,
        description: dto.description,
        photo_file_path: photoFile ?? dto.photo_file_path ?? null,
        created_at: new Date(),
        created_by: auteurId,
      },
      include: {
        categorie_incident: { select: { id: true, libelle: true, code: true } },
        user: { select: { id: true, prenom: true, nom: true } },
      },
    });
    await this.notif.sendToCite(citeId, 'Nouvel incident signalé', incident.description, {
      features: ['INCIDENT_READ'],
      exceptUserId: auteurId,
      typeId: 8,
      data: { incident_id: incident.id },
    });
    return incident;
  }

  async findAll(citeId: string, userId: string) {
    const incidents = await this.prisma.incident.findMany({
      where: { cite_id: citeId, is_deleted: false },
      orderBy: { created_at: 'desc' as const },
      include: {
        categorie_incident: { select: { id: true, libelle: true, code: true } },
        user: { select: { id: true, prenom: true, nom: true } },
        villa: { select: { id: true, numero: true, rue: true } },
        statut_incident: { select: STATUT_INCIDENT_SELECT },
        incident_like: { select: { user_id: true } },
        _count: { select: { incident_commentaire: true } },
      },
    });
    return incidents.map((i) => ({
      id: i.id,
      cite_id: i.cite_id,
      auteur: i.user,
      categorie: i.categorie_incident,
      villa: i.villa,
      statut: i.statut_incident,
      titre: i.titre,
      description: i.description,
      photo_file_path: i.photo_file_path,
      note_syndic: i.note_syndic,
      resolu_at: i.resolu_at,
      created_at: i.created_at,
      likes_count: i.incident_like.length,
      liked_by_me: i.incident_like.some((l) => l.user_id === userId),
      commentaires_count: i._count.incident_commentaire,
    }));
  }

  async findOne(id: string, citeId: string, userId: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, cite_id: citeId, is_deleted: false },
      include: {
        categorie_incident: { select: { id: true, libelle: true, code: true } },
        user: { select: { id: true, prenom: true, nom: true } },
        villa: { select: { id: true, numero: true, rue: true } },
        statut_incident: { select: STATUT_INCIDENT_SELECT },
        incident_like: true,
        incident_commentaire: {
          where: { is_deleted: false },
          orderBy: { created_at: 'asc' as const },
          include: {
            user: { select: { id: true, prenom: true, nom: true } },
          },
        },
      },
    });
    if (!incident) throw new NotFoundException('Incident introuvable');

    const commentaires = this.treeComments(incident.incident_commentaire as any[]);
    return {
      id: incident.id,
      cite_id: incident.cite_id,
      auteur_id: incident.auteur_id,
      auteur: incident.user,
      villa: incident.villa,
      categorie: incident.categorie_incident,
      statut: incident.statut_incident,
      titre: incident.titre,
      description: incident.description,
      photo_file_path: incident.photo_file_path,
      note_syndic: incident.note_syndic,
      resolu_at: incident.resolu_at,
      created_at: incident.created_at,
      likes_count: incident.incident_like.length,
      liked_by_me: incident.incident_like.some((l) => l.user_id === userId),
      commentaires,
    };
  }

  private treeComments(comments: any[]): any[] {
    const level1 = comments.filter((c) => c.niveau === 1);
    return level1.map((c) => ({
      id: c.id,
      texte: c.texte,
      created_at: c.created_at,
      auteur: c.user,
      reponses: comments.filter((r) => r.parent_id === c.id && r.niveau === 2),
    }));
  }

  async toggleLike(incidentId: string, citeId: string, userId: string) {
    await this.findOneOrThrow(incidentId, citeId);
    const existing = await this.prisma.incident_like.findUnique({
      where: { incident_id_user_id: { incident_id: incidentId, user_id: userId } },
    });
    if (existing) {
      await this.prisma.incident_like.delete({
        where: { incident_id_user_id: { incident_id: incidentId, user_id: userId } },
      });
      return { liked: false };
    }
    await this.prisma.incident_like.create({ data: { incident_id: incidentId, user_id: userId } });
    const incident = await this.findOneOrThrow(incidentId, citeId);
    if (incident.auteur_id !== userId) {
      await this.notif.sendToUser({
        cite_id: citeId,
        user_id: incident.auteur_id,
        titre: 'Like sur votre incident',
        message: 'Un habitant a aimé votre signalement.',
        typeId: 10,
        data: { incident_id: incidentId, user_id: userId },
      });
    }
    return { liked: true };
  }

  async addCommentaire(incidentId: string, citeId: string, userId: string, dto: CommentaireDto) {
    const incident = await this.findOneOrThrow(incidentId, citeId);
    const commentaire = await this.prisma.incident_commentaire.create({
      data: {
        incident_id: incidentId,
        auteur_id: userId,
        niveau: 1,
        texte: dto.texte,
        created_at: new Date(),
        created_by: userId,
      },
      select: COMMENTER_SELECT,
    });
    if (incident.auteur_id !== userId) {
      await this.notif.sendToUser({
        cite_id: citeId,
        user_id: incident.auteur_id,
        titre: 'Commentaire sur votre incident',
        message: dto.texte,
        typeId: 11,
        data: { incident_id: incidentId, user_id: userId },
      });
    }
    return commentaire;
  }

  async repondre(incidentId: string, commentId: string, citeId: string, userId: string, dto: CommentaireDto) {
    await this.findOneOrThrow(incidentId, citeId);
    const parent = await this.prisma.incident_commentaire.findFirst({
      where: { id: commentId, incident_id: incidentId, is_deleted: false },
    });
    if (!parent) throw new NotFoundException('Commentaire introuvable');
    if (parent.niveau >= 2) {
      throw new BadRequestException('Profondeur maximale de 2 niveaux atteinte');
    }
    return this.prisma.incident_commentaire.create({
      data: {
        incident_id: incidentId,
        auteur_id: userId,
        parent_id: parent.id,
        niveau: (parent.niveau + 1) as 1 | 2,
        texte: dto.texte,
        created_at: new Date(),
        created_by: userId,
      },
      select: COMMENTER_SELECT,
    });
  }

  private async findOneOrThrow(id: string, citeId: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, cite_id: citeId, is_deleted: false },
    });
    if (!incident) throw new NotFoundException('Incident introuvable');
    return incident;
  }

  async getCategories() {
    return this.prisma.categorie_incident.findMany({
      where: { is_deleted: false },
      select: { id: true, libelle: true, code: true, icon_name: true },
      orderBy: { libelle: 'asc' },
    });
  }

  async getStatuts() {
    return this.prisma.statut_incident.findMany({
      where: { is_deleted: false },
      select: { id: true, libelle: true, code: true },
      orderBy: { id: 'asc' },
    });
  }

  async prendreEnCharge(
    id: string,
    citeId: string,
    syndicId: string,
    dto: PrendreEnChargeIncidentDto,
  ) {
    const incident = await this.findOneOrThrow(id, citeId);
    if (incident.pris_en_charge_par) {
      throw new BadRequestException('Incident déjà pris en charge');
    }
    const updated = await this.prisma.incident.update({
      where: { id },
      data: {
        statut_id: STATUT_INCIDENT_EN_COURS,
        pris_en_charge_par: syndicId,
        pris_en_charge_at: new Date(),
        ...(dto.note_syndic !== undefined && { note_syndic: dto.note_syndic }),
        updated_at: new Date(),
        updated_by: syndicId,
      },
      include: { statut_incident: { select: STATUT_INCIDENT_SELECT } },
    });
    await this.notif.sendToUser({
      cite_id: citeId,
      user_id: incident.auteur_id,
      titre: 'Incident pris en charge',
      message: 'Le syndic a pris en charge votre incident.',
      typeId: 8,
      data: { incident_id: id },
    });
    return updated;
  }

  async resoudre(id: string, citeId: string, syndicId: string, dto: ResoudreIncidentDto) {
    const incident = await this.findOneOrThrow(id, citeId);
    const updated = await this.prisma.incident.update({
      where: { id },
      data: {
        statut_id: STATUT_INCIDENT_RESOLU,
        resolu_par: syndicId,
        resolu_at: new Date(),
        note_syndic: dto.resolution_note,
        updated_at: new Date(),
        updated_by: syndicId,
      },
      include: { statut_incident: { select: STATUT_INCIDENT_SELECT } },
    });
    await this.notif.sendToUser({
      cite_id: citeId,
      user_id: incident.auteur_id,
      titre: 'Incident résolu',
      message: dto.resolution_note,
      typeId: 8,
      data: { incident_id: id },
    });
    return updated;
  }

  async noteSyndic(id: string, citeId: string, syndicId: string, dto: NoteSyndicIncidentDto) {
    await this.findOneOrThrow(id, citeId);
    return this.prisma.incident.update({
      where: { id },
      data: {
        note_syndic: dto.note_syndic,
        updated_at: new Date(),
        updated_by: syndicId,
      },
      include: { statut_incident: { select: STATUT_INCIDENT_SELECT } },
    });
  }
}