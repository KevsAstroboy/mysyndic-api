import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifService } from '../../common/services/notif.service';
import { CreateAnnonceDto } from './dto/create-annonce.dto';
import { UpdateAnnonceDto } from './dto/update-annonce.dto';

@Injectable()
export class AnnonceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotifService,
  ) {}

  async findAll(citeId: string) {
    return this.prisma.annonce.findMany({
      where: { cite_id: citeId, is_deleted: false },
      orderBy: [{ est_epinglee: 'desc' as const }, { created_at: 'desc' as const }],
      include: {
        categorie_annonce: { select: { id: true, libelle: true, code: true } },
        user: {
          select: { id: true, prenom: true, nom: true },
        },
      },
    });
  }

  async findOne(id: string, citeId: string) {
    const entity = await this.prisma.annonce.findFirst({
      where: { id, cite_id: citeId, is_deleted: false },
      include: {
        categorie_annonce: { select: { id: true, libelle: true, code: true } },
        user: {
          select: { id: true, prenom: true, nom: true },
        },
      },
    });
    if (!entity) throw new NotFoundException('Annonce introuvable');
    return entity;
  }

  async create(citeId: string, auteurId: string, dto: CreateAnnonceDto) {
    const annonce = await this.prisma.annonce.create({
      data: {
        cite_id: citeId,
        auteur_id: auteurId,
        categorie_id: dto.categorie_id ?? null,
        titre: dto.titre,
        contenu: dto.contenu,
        est_epinglee: dto.est_epinglee ?? false,
        created_at: new Date(),
        created_by: auteurId,
      },
      include: {
        categorie_annonce: { select: { id: true, libelle: true, code: true } },
      },
    });
    await this.notif.sendToCite(
      citeId,
      'Nouvelle annonce',
      dto.est_epinglee ? `[Épinglée] ${dto.titre}` : dto.titre,
      {
        exceptUserId: auteurId,
        typeId: 7,
        data: { annonce_id: annonce.id },
      },
    );
    return annonce;
  }

  async update(id: string, citeId: string, auteurId: string, dto: UpdateAnnonceDto) {
    await this.findOne(id, citeId);
    return this.prisma.annonce.update({
      where: { id },
      data: {
        ...(dto.categorie_id !== undefined && { categorie_id: dto.categorie_id }),
        ...(dto.titre !== undefined && { titre: dto.titre }),
        ...(dto.contenu !== undefined && { contenu: dto.contenu }),
        ...(dto.est_epinglee !== undefined && { est_epinglee: dto.est_epinglee }),
        updated_at: new Date(),
        updated_by: auteurId,
      },
      include: {
        categorie_annonce: { select: { id: true, libelle: true, code: true } },
      },
    });
  }

  async remove(id: string, citeId: string, userId: string) {
    await this.findOne(id, citeId);
    return this.prisma.annonce.update({
      where: { id },
      data: { is_deleted: true, deleted_at: new Date(), deleted_by: userId },
    });
  }

  async getCategories() {
    return this.prisma.categorie_annonce.findMany({
      where: { is_deleted: false },
      select: { id: true, libelle: true, code: true },
      orderBy: { libelle: 'asc' },
    });
  }
}