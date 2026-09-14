import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifService } from '../../common/services/notif.service';
import { CreateConflitDto } from './dto/create-conflit.dto';
import {
  PrendreEnChargeDto,
  ResoudreConflitDto,
  NoteSyndicDto,
} from './dto/update-conflit.dto';

const STATUT_CONFLIT_SIGNALE = 1;
const STATUT_CONFLIT_MEDIATION = 2;
const STATUT_CONFLIT_RESOLU = 3;
const STATUT_CONFLIT_CLASSE = 4;

const CONFLIT_INCLUDE = {
  categorie_conflit: { select: { id: true, libelle: true, code: true } },
  statut_conflit: { select: { id: true, libelle: true, code: true } },
  user_conflit_declarant_idTouser: { select: { id: true, prenom: true, nom: true } },
  villa_conflit_villa_ciblee_idTovilla: { select: { id: true, numero: true, rue: true } },
} as const;

@Injectable()
export class ConflitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotifService,
  ) {}

  async findById(id: string, citeId: string) {
    const conflit = await this.prisma.conflit.findFirst({
      where: { id, cite_id: citeId, is_deleted: false },
      include: CONFLIT_INCLUDE,
    });
    if (!conflit) throw new NotFoundException('Conflit introuvable');
    return conflit;
  }

  async create(citeId: string, declarantId: string, dto: CreateConflitDto) {
    if (dto.villa_declarant_id) {
      const villa = await this.prisma.villa.findFirst({
        where: { id: dto.villa_declarant_id, cite_id: citeId, is_deleted: false },
      });
      if (!villa) throw new ForbiddenException('Villa déclarant hors de votre cité');
    }
    const conflit = await this.prisma.conflit.create({
      data: {
        cite_id: citeId,
        declarant_id: declarantId,
        villa_declarant_id: dto.villa_declarant_id ?? null,
        categorie_id: dto.categorie_id ?? null,
        villa_ciblee_id: dto.villa_ciblee_id ?? null,
        villa_ciblee_num: dto.villa_ciblee_num,
        description: dto.description,
        statut_id: STATUT_CONFLIT_SIGNALE,
        created_at: new Date(),
        created_by: declarantId,
      },
      include: CONFLIT_INCLUDE,
    });
    await this.notif.sendToCite(
      citeId,
      'Conflit déclaré',
      `Conflit ${dto.villa_ciblee_num} : ${dto.description.slice(0, 80)}`,
      {
        features: ['CONFLIT_MANAGE'],
        exceptUserId: declarantId,
        typeId: 9,
        data: { conflit_id: conflit.id },
      },
    );
    return conflit;
  }

  async findMine(citeId: string, userId: string) {
    return this.prisma.conflit.findMany({
      where: { cite_id: citeId, declarant_id: userId, is_deleted: false },
      orderBy: { created_at: 'desc' as const },
      include: CONFLIT_INCLUDE,
    });
  }

  async findAll(citeId: string) {
    return this.prisma.conflit.findMany({
      where: { cite_id: citeId, is_deleted: false },
      orderBy: { created_at: 'desc' as const },
      include: CONFLIT_INCLUDE,
    });
  }

  async prendreEnCharge(id: string, citeId: string, syndicId: string, dto: PrendreEnChargeDto) {
    const conflit = await this.findById(id, citeId);
    if (conflit.pris_en_charge_par) {
      throw new ConflictException('Conflit déjà pris en charge');
    }
    const updated = await this.prisma.conflit.update({
      where: { id },
      data: {
        pris_en_charge_par: syndicId,
        pris_en_charge_at: new Date(),
        statut_id: STATUT_CONFLIT_MEDIATION,
        ...(dto.note_syndic !== undefined && { note_syndic: dto.note_syndic }),
        updated_at: new Date(),
        updated_by: syndicId,
      },
      include: CONFLIT_INCLUDE,
    });
    await this.notif.sendToUser({
      cite_id: citeId,
      user_id: conflit.declarant_id,
      titre: 'Conflit pris en charge',
      message: 'Le syndic a pris en charge votre conflit.',
      typeId: 9,
      data: { conflit_id: conflit.id },
    });
    return updated;
  }

  async resoudre(id: string, citeId: string, syndicId: string, dto: ResoudreConflitDto) {
    const conflit = await this.findById(id, citeId);
    const statut = dto.classe_sans_suite ? STATUT_CONFLIT_CLASSE : STATUT_CONFLIT_RESOLU;
    const updated = await this.prisma.conflit.update({
      where: { id },
      data: {
        statut_id: statut,
        resolution_note: dto.resolution_note,
        resolu_at: new Date(),
        updated_at: new Date(),
        updated_by: syndicId,
      },
      include: CONFLIT_INCLUDE,
    });
    await this.notif.sendToUser({
      cite_id: citeId,
      user_id: conflit.declarant_id,
      titre: 'Conflit résolu',
      message: dto.resolution_note,
      typeId: 9,
      data: { conflit_id: conflit.id },
    });
    return updated;
  }

  async noteSyndic(id: string, citeId: string, syndicId: string, dto: NoteSyndicDto) {
    await this.findById(id, citeId);
    return this.prisma.conflit.update({
      where: { id },
      data: {
        note_syndic: dto.note_syndic,
        updated_at: new Date(),
        updated_by: syndicId,
      },
      include: CONFLIT_INCLUDE,
    });
  }

  async getCategories() {
    return this.prisma.categorie_conflit.findMany({
      where: { is_deleted: false },
      select: { id: true, libelle: true, code: true },
      orderBy: { libelle: 'asc' },
    });
  }

  async getStatuts() {
    return this.prisma.statut_conflit.findMany({
      where: { is_deleted: false },
      select: { id: true, libelle: true, code: true },
      orderBy: { id: 'asc' },
    });
  }
}