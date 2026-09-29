import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCiteDto, UpdateCiteDto } from './dto/cite.dto';

interface RecouvrementRow {
  cite_id: string;
  nb_confirmes: number;
  nombre_villas_attendu: number;
  montant_collecte: number;
  taux_recouvrement_pct: number;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class CiteService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /cites — toutes les cités avec stats agrégées (Super Admin)
  async findAll(filter?: { mois?: string; debut?: string; fin?: string }) {
    const isMonth = (m?: string) =>
      m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null;
    const mois = isMonth(filter?.mois) ?? currentMonth();
    const debut = isMonth(filter?.debut);
    const fin = isMonth(filter?.fin);
    const isRange = Boolean(debut && fin);

    const cites = await this.prisma.cite.findMany({
      where: { is_deleted: false },
      orderBy: { nom: 'asc' },
    });

    const recQuery = isRange
      ? `SELECT cite_id,
                COALESCE(SUM(nb_confirmes), 0)::int            AS nb_confirmes,
                COALESCE(SUM(nombre_villas_attendu), 0)::int   AS nombre_villas_attendu,
                COALESCE(SUM(montant_collecte), 0)::float8     AS montant_collecte,
                COALESCE(ROUND(
                  SUM(nb_confirmes)::numeric
                  / NULLIF(SUM(nombre_villas_attendu), 0) * 100, 1
                ), 0)::float8                                  AS taux_recouvrement_pct
         FROM v_recouvrement_mensuel
         WHERE mois >= $1 AND mois <= $2
         GROUP BY cite_id`
      : `SELECT cite_id,
                COALESCE(nb_confirmes, 0)::int               AS nb_confirmes,
                COALESCE(nombre_villas_attendu, 0)::int      AS nombre_villas_attendu,
                COALESCE(montant_collecte, 0)::float8        AS montant_collecte,
                COALESCE(taux_recouvrement_pct, 0)::float8   AS taux_recouvrement_pct
         FROM v_recouvrement_mensuel
         WHERE mois = $1`;

    const recArgs = isRange ? [debut, fin] : [mois];

    const [villaCounts, habitantCounts, recRows] = await Promise.all([
      this.prisma.villa.groupBy({
        by: ['cite_id'],
        where: { is_deleted: false },
        _count: { _all: true },
      }),
      this.prisma.user.groupBy({
        by: ['cite_id'],
        where: { is_active: true, is_deleted: false },
        _count: { _all: true },
      }),
      this.prisma.$queryRawUnsafe<RecouvrementRow[]>(recQuery, ...recArgs),
    ]);

    const villaByCite = new Map(villaCounts.map((v) => [v.cite_id, v._count._all]));
    const habitantByCite = new Map(habitantCounts.map((h) => [h.cite_id, h._count._all]));
    const recByCite = new Map(recRows.map((r) => [r.cite_id, r]));

    return cites.map((cite) => {
      const rec = recByCite.get(cite.id);
      return {
        ...cite,
        stats: {
          nb_villas: villaByCite.get(cite.id) ?? 0,
          nb_habitants: habitantByCite.get(cite.id) ?? 0,
          mois: isRange ? `${debut}..${fin}` : mois,
          nb_confirmes: rec?.nb_confirmes ?? 0,
          nombre_villas_attendu: rec?.nombre_villas_attendu ?? 0,
          montant_collecte: rec?.montant_collecte ?? 0,
          taux_recouvrement_pct: rec?.taux_recouvrement_pct ?? 0,
        },
      };
    });
  }

  async findOne(id: string) {
    const cite = await this.prisma.cite.findFirst({
      where: { id, is_deleted: false },
    });
    if (!cite) throw new NotFoundException('Cité introuvable');
    return cite;
  }

  // POST /cites — transaction atomique (R8)
  async create(dto: CreateCiteDto) {
    const existing = await this.prisma.cite.findFirst({
      where: { nom: dto.nom, is_deleted: false },
    });
    if (existing) {
      throw new ConflictException('Cette cité existe déjà');
    }

    return this.prisma.$transaction(async (tx) => {
      const cite = await tx.cite.create({
        data: {
          nom: dto.nom,
          ville: dto.ville,
          pays: dto.pays || "Côte d'Ivoire",
          is_active: true,
          created_at: new Date(),
        },
      });

      // 2. groupe_cite auto (nom "Chat {cite.nom}")
      await tx.groupe_cite.create({
        data: {
          cite_id: cite.id,
          nom: `Chat ${cite.nom}`,
          created_at: new Date(),
        },
      });

      // 3. configuration par défaut
      await tx.configuration.create({
        data: {
          cite_id: cite.id,
          paystack_subaccount_mode: 'SIMPLE',
          paystack_subaccount_split: 100,
          ...(dto.nombre_villas_attendu !== undefined && { nombre_villas_attendu: dto.nombre_villas_attendu }),
          ...(dto.paystack_subaccount_code !== undefined && { paystack_subaccount_code: dto.paystack_subaccount_code }),
          created_at: new Date(),
        },
      });

      // 4. audit
      await tx.audit_log.create({
        data: {
          cite_id: cite.id,
          profil_actif_code: 'SUPER_ADMIN',
          action: 'CREATE',
          entite: 'cite',
          entite_id: cite.id,
          created_at: new Date(),
        } as any,
      });

      return cite;
    });
  }

  // PATCH /cites/:id
  async update(id: string, dto: UpdateCiteDto) {
    await this.findOne(id);
    const cite = await this.prisma.cite.update({
      where: { id },
      data: {
        ...(dto.nom !== undefined && { nom: dto.nom }),
        ...( dto.ville !== undefined && { ville: dto.ville }),
        ...( dto.pays !== undefined && { pays: dto.pays }),
        ...( dto.is_active !== undefined && { is_active: dto.is_active }),
        updated_at: new Date(),
      },
    });

    // Champs stockés dans la configuration (nombre de villas attendu, subaccount Paystack).
    if (dto.nombre_villas_attendu !== undefined || dto.paystack_subaccount_code !== undefined) {
      await this.prisma.configuration.updateMany({
        where: { cite_id: id, is_deleted: false },
        data: {
          ...(dto.nombre_villas_attendu !== undefined && { nombre_villas_attendu: dto.nombre_villas_attendu }),
          ...(dto.paystack_subaccount_code !== undefined && { paystack_subaccount_code: dto.paystack_subaccount_code }),
          updated_at: new Date(),
        },
      });
    }

    return cite;
  }
}