import {
  Inject,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { NotifService } from '../../common/services/notif.service';
import { UploadService, isUploadEmpty } from '../../common/services/upload.service';
import { ReceiptImageService } from './receipt-image.service';
import { ExcelExportService } from './excel-export.service';
import { PaystackClientService } from './paystack-client.service';
import { InitPaystackDto, PaiementManuelDto } from './dto/paiement.dto';

const STATUT_EN_ATTENTE = 1;
const STATUT_CONFIRME = 2;
const STATUT_ECHOUE = 3;
const STATUT_ANNULE = 5;
const CANAL_PAYSTACK = 1;

/** Délai avant annulation d'un paiement Paystack laissé en attente (défaut 30 min). */
const EXPIRATION_DEFAULT_MINUTES = 30;
/** Fréquence du balayage des paiements expirés (ms). */
const EXPIRATION_TICK_MS = 60_000;

/** Les vues SQL renvoient des BIGINT (count/sum) et NUMERIC (Decimal) non sérialisables en JSON. */
function normalizeRawRows<T>(rows: T[]): T[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      if (typeof v === 'bigint') out[k] = Number(v);
      else if (Prisma.Decimal.isDecimal(v)) out[k] = v.toNumber();
      else out[k] = v;
    }
    return out as T;
  });
}

/** Liste inclusive des mois « YYYY-MM » entre deux mois. */
function listMonths(debut: string, fin: string): string[] {
  const [y1, m1] = debut.split('-').map(Number);
  const [y2, m2] = fin.split('-').map(Number);
  const result: string[] = [];
  let y = y1;
  let m = m1;
  while (y < y2 || (y === y2 && m <= m2)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
}

@Injectable()
export class PaiementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaiementService.name);
  private expirationTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly notif: NotifService,
    private readonly receiptImage: ReceiptImageService,
    private readonly excel: ExcelExportService,
    private readonly paystack: PaystackClientService,
    private readonly upload: UploadService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    const minutes = await this.expirationDelayMinutes();
    if (minutes <= 0) return; // expiration désactivée (PAIEMENT_EXPIRATION_MINUTES <= 0)
    this.expirationTimer = setInterval(() => {
      this.expirerPaiementsEnAttente().catch((e) =>
        this.logger.error(`Balayage expiration paiement échoué: ${String(e)}`),
      );
    }, EXPIRATION_TICK_MS);
    this.logger.log(
      `Expiration auto des paiements en attente activée (délai ${minutes} min, tick ${EXPIRATION_TICK_MS / 60000} min)`,
    );
  }

  onModuleDestroy() {
    if (this.expirationTimer) clearInterval(this.expirationTimer);
  }

  /** Priorité : app_config → env PAIMENT_EXPIRATION_MINUTES → 30 min. 0 = désactivé. */
  private async expirationDelayMinutes(): Promise<number> {
    const fromConfig = await this.appConfigValue('PAIEMENT_EXPIRATION_MINUTES', '');
    const raw = (fromConfig !== '' && fromConfig !== null)
      ? fromConfig
      : (this.config.get('PAIEMENT_EXPIRATION_MINUTES') ?? EXPIRATION_DEFAULT_MINUTES);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** Annule les paiements Paystack restés EN_ATTENTE plus longtemps que le délai configuré. */
  async expirerPaiementsEnAttente(): Promise<number> {
    const minutes = await this.expirationDelayMinutes();
    if (minutes <= 0) return 0;
    const cutoff = new Date(Date.now() - minutes * 60_000);
    const { count } = await this.prisma.paiement.updateMany({
      where: {
        statut_id: STATUT_EN_ATTENTE,
        canal_id: CANAL_PAYSTACK,
        updated_at: { lt: cutoff },
        is_deleted: false,
      },
      data: { statut_id: STATUT_ANNULE, updated_at: new Date() },
    });
    if (count > 0) {
      this.logger.warn(`${count} paiement(s) en attente annulé(s) (délai ${minutes} min dépassé)`);
    }
    return count;
  }

  // ── Initiation Paystack ─────────────────────────────────
  async initPaystack(userId: string, dto: InitPaystackDto, citeId: string | null = null) {
    const uv = await this.prisma.user_villa.findFirst({
      where: {
        user_id: userId,
        villa_id: dto.villa_id,
        is_current: true,
        is_deleted: false,
        // Multi-cités : on paie la cotisation dans la cité ACTIVE (celle du
        // token), pas une autre villa que l'utilisateur possède ailleurs.
        ...(citeId ? { cite_id: citeId } : {}),
      },
    });
    if (!uv) {
      throw new ForbiddenException({ code: 'VILLA_NON_ASSIGNEE', message: 'Vous n occupez pas cette villa' });
    }

    const deja = await this.prisma.paiement.findFirst({
      where: {
        cite_id: uv.cite_id,
        villa_id: dto.villa_id,
        mois: dto.mois,
        is_deleted: false,
      },
    });

    const config = await this.prisma.configuration.findFirst({
      where: { cite_id: uv.cite_id, is_deleted: false },
    });
    const montant = config?.cotisation_mensuelle ?? null;
    if (!montant) {
      throw new BadRequestException({ code: 'CONFIG_MONTANT_MANQUANT', message: 'Cotisation mensuelle non configurée' });
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, is_deleted: false },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    let paiement: { id: string; statut_id: number | null };
    if (deja) {
      if (deja.statut_id === STATUT_CONFIRME) {
        throw new BadRequestException({ code: 'PAIEMENT_DEJA_CONFIRME', message: 'Paiement déjà confirmé pour ce mois' });
      }
      // Relance : un paiement EN_ATTENTE expiré (ou déjà annulé/échoué) est réutilisé,
      // pas dupliqué (contrainte unique cite_id + villa_id + mois).
      const expired =
        deja.statut_id === STATUT_ANNULE ||
        deja.statut_id === STATUT_ECHOUE ||
        (deja.statut_id === STATUT_EN_ATTENTE &&
          deja.updated_at &&
          Date.now() - deja.updated_at.getTime() > (await this.expirationDelayMinutes()) * 60_000);
      if (!expired) {
        throw new BadRequestException({ code: 'PAIEMENT_DEJA_INITIE', message: 'Un paiement est déjà initié pour ce mois' });
      }
      paiement = await this.prisma.paiement.update({
        where: { id: deja.id },
        data: {
          statut_id: STATUT_EN_ATTENTE,
          canal_id: CANAL_PAYSTACK,
          reference_paystack: null,
          updated_at: new Date(),
        },
      });
    } else {
      paiement = await this.prisma.paiement.create({
        data: {
          cite_id: uv.cite_id,
          villa_id: dto.villa_id,
          saisi_par: userId,
          mois: dto.mois,
          montant,
          statut_id: STATUT_EN_ATTENTE,
          canal_id: CANAL_PAYSTACK,
          reference_paystack: null,
          created_at: new Date(),
          created_by: userId,
        },
      });
    }

    // Paystack impose une référence unique par transaction : une relance du même
    // paiement (id stable) doit générer une nouvelle référence, sinon erreur 400
    // « Duplicate Transaction Reference ». Le webhook relie la référence au
    // paiement via reference_paystack.
    const ref = `${paiement.id}-${Date.now()}`;
    let url: string;
    try {
      const init = await this.paystack.initializePayment({
        amount: montant,
        email: user.email,
        reference: ref,
        subaccount: config?.paystack_subaccount_code ?? undefined,
        subaccountMode: (config?.paystack_subaccount_mode as 'SIMPLE' | 'SPLIT' | null) ?? null,
        subaccountSplit: config?.paystack_subaccount_split ?? null,
      });
      url = init.authorization_url;
      await this.prisma.paiement.update({
        where: { id: paiement.id },
        data: { reference_paystack: ref, updated_at: new Date() },
      });
    } catch (e) {
      await this.prisma.paiement.update({
        where: { id: paiement.id },
        data: { statut_id: STATUT_ECHOUE, updated_at: new Date() },
      });
      this.logger.error(`Paystack init failed: ${String(e)}`);
      throw new BadRequestException({ code: 'PAYSTACK_INIT_ERROR', message: 'Erreur lors de l initialisation du paiement' });
    }

    await this.notif.sendToUser({
      cite_id: uv.cite_id,
      user_id: userId,
      titre: 'Paiement initié',
      message: `Paiement Paystack de ${montant} FCFA pour ${dto.mois} initié.`,
    });

    return { authorization_url: url, reference: ref, montant, mois: dto.mois };
  }

  // ── Saisie manuelle multi-mois ──────────────────────────
  async saisieManuelle(
    actor: { sub: string; cite_id: string | null },
    dto: PaiementManuelDto,
    preuve?: Express.Multer.File,
  ) {
    if (!actor.cite_id) throw new ForbiddenException('Cité requise');

    const villa = await this.prisma.villa.findFirst({
      where: { id: dto.villa_id, cite_id: actor.cite_id, is_deleted: false },
    });
    if (!villa) throw new NotFoundException('Villa introuvable');

    const maxMoins = Number(await this.appConfigValue('MULTI_MOIS_PAIEMENT_MAX', 12));
    if (dto.mois.length > maxMoins) {
      throw new BadRequestException({
        code: 'TROP_DE_MOIS',
        message: `Maximum ${maxMoins} mois par saisie`,
      });
    }

    const canalRow = await this.prisma.canal_paiement.findFirst({
      where: { code: dto.canal, is_manuel: true, is_deleted: false },
    });
    if (!canalRow) throw new BadRequestException('Canal invalide');

    const deja = await this.prisma.paiement.findFirst({
      where: {
        cite_id: actor.cite_id,
        villa_id: dto.villa_id,
        mois: { in: dto.mois },
        is_deleted: false,
      },
    });
    if (deja) {
      throw new BadRequestException({
        code: 'MOIS_DEJA_CONFIRME',
        message: `Le mois ${deja.mois} est déjà enregistré`,
      });
    }

    const preuvePath =
      preuve && !isUploadEmpty(preuve)
        ? await this.upload.uploadPhoto(actor.cite_id, 'preuves', preuve)
        : (dto.preuve_url ?? null);

    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      const list: { id: string; mois: string }[] = [];
      for (const mois of dto.mois) {
        const p = await tx.paiement.create({
          data: {
            cite_id: actor.cite_id!,
            villa_id: dto.villa_id,
            saisi_par: actor.sub,
            mois,
            montant: dto.montant,
            statut_id: STATUT_CONFIRME,
            canal_id: canalRow.id,
            reference_externe: dto.reference_externe ? `${dto.reference_externe}:${mois}` : null,
            preuve_file_path: preuvePath,
            note: dto.note,
            created_at: now,
            created_by: actor.sub,
          },
        });
        list.push({ id: p.id, mois });
      }
      await tx.audit_log.create({
        data: {
          cite_id: actor.cite_id,
          user_id: actor.sub,
          action: 'CREATE',
          entite: 'paiement',
          entite_id: dto.villa_id,
          created_at: now,
        } as any,
      });
      return list;
    });

    for (const p of created) {
      this.generateReceipt({
        paiementId: p.id,
        cite_id: actor.cite_id!,
        villa,
        mois: p.mois,
        montant: dto.montant,
        canal: dto.canal,
      }).catch((e) => this.logger.error(`PDF recu failed pour ${p.id}: ${String(e)}`));
    }

    await this.notif.sendToCiteOccupants(
      actor.cite_id,
      'Paiements régularisés',
      `${created.length} mois confirmés pour la villa ${villa.numero}`,
    );

    return { paiements: created, message: `${created.length} paiement(s) confirmé(s)` };
  }

  // ── Historique / impayés / recouvrement ─────────────────
  async historiqueVilla(villaId: string, citeId: string) {
    return this.prisma.paiement.findMany({
      where: { villa_id: villaId, cite_id: citeId, is_deleted: false },
      include: { statut_paiement: true, canal_paiement: true },
      orderBy: { mois: 'desc' },
    });
  }

  async impayesMoisCourant(citeId: string) {
    return this.impayesMois(citeId);
  }

  /** Impayés d'un mois donné (par défaut le mois courant) ou d'une plage de mois. */
  async impayesMois(
    citeId: string,
    opts?: { mois?: string; debut?: string; fin?: string },
  ) {
    if (opts?.debut && opts?.fin) {
      return this.impayesPeriode(citeId, opts.debut, opts.fin);
    }
    const target = opts?.mois ?? new Date().toISOString().slice(0, 7);
    const rows = await this.prisma.$queryRawUnsafe<unknown[]>(
      `SELECT
         v.cite_id,
         c.nom                                 AS nom_cite,
         v.id                                  AS villa_id,
         v.numero                              AS villa_numero,
         v.rue                                 AS villa_rue,
         conf.cotisation_mensuelle             AS montant_attendu,
         $2::text                              AS mois
       FROM villa v
       JOIN cite c ON c.id = v.cite_id
       LEFT JOIN configuration conf ON conf.cite_id = v.cite_id
       WHERE v.is_active = TRUE
         AND v.is_deleted = FALSE
         AND v.cite_id = $1::uuid
         AND v.id NOT IN (
           SELECT villa_id FROM paiement
           WHERE mois = $2 AND statut_id = 2 AND is_deleted = FALSE
         )
       ORDER BY v.numero`,
      citeId,
      target,
    );
    return normalizeRawRows(rows);
  }

  /** Impayés agrégés sur une plage : cotisation × nb de mois non réglés. */
  private async impayesPeriode(citeId: string, debut: string, fin: string) {
    const rows = await this.prisma.$queryRawUnsafe<unknown[]>(
      `SELECT
         v.id                     AS villa_id,
         v.numero                 AS villa_numero,
         v.rue                    AS villa_rue,
         conf.cotisation_mensuelle AS cotisation,
         p.mois                   AS mois_paye
       FROM villa v
       LEFT JOIN configuration conf ON conf.cite_id = v.cite_id
       LEFT JOIN paiement p
         ON p.villa_id = v.id AND p.statut_id = 2 AND p.is_deleted = FALSE
         AND p.mois >= $2 AND p.mois <= $3
       WHERE v.cite_id = $1::uuid AND v.is_active = TRUE AND v.is_deleted = FALSE
       ORDER BY v.numero`,
      citeId,
      debut,
      fin,
    );

    const months = listMonths(debut, fin);
    const byVilla = new Map<string, any>();
    for (const r of normalizeRawRows(rows) as any[]) {
      if (!byVilla.has(r.villa_id)) {
        byVilla.set(r.villa_id, { ...r, paid: new Set<string>() });
      }
      if (r.mois_paye) byVilla.get(r.villa_id).paid.add(r.mois_paye);
    }

    const result: any[] = [];
    for (const v of byVilla.values()) {
      const unpaid = months.filter((m) => !v.paid.has(m));
      if (unpaid.length === 0) continue;
      result.push({
        cite_id: citeId,
        villa_id: v.villa_id,
        villa_numero: v.villa_numero,
        villa_rue: v.villa_rue,
        montant_attendu: (v.cotisation ?? 0) * unpaid.length,
        nb_mois: unpaid.length,
        mois: fin,
        mois_debut: debut,
      });
    }
    return result;
  }

  async recouvrementMensuel(
    citeId: string,
    filter?: { mois?: string; debut?: string; fin?: string },
  ) {
    const where = ['cite_id = $1::uuid'];
    const args: string[] = [citeId];
    if (filter?.mois) {
      args.push(filter.mois);
      where.push(`mois = $${args.length}::text`);
    } else if (filter?.debut && filter?.fin) {
      args.push(filter.debut);
      where.push(`mois >= $${args.length}::text`);
      args.push(filter.fin);
      where.push(`mois <= $${args.length}::text`);
    }
    const rows = await this.prisma.$queryRawUnsafe<unknown[]>(
      `SELECT * FROM v_recouvrement_mensuel WHERE ${where.join(' AND ')} ORDER BY mois`,
      ...args,
    );
    return normalizeRawRows(rows);
  }

  /**
   * Détail d'un paiement par id (statut après retour Paystack).
   * Scope : SA sans cité = toutes cités ; staff = cité active ;
   * HABITANT = uniquement les paiements des villas courantes de sa cité.
   */
  async findOneById(
    paiementId: string,
    user: { sub: string; cite_id: string | null; role: string },
  ) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paiementId)) {
      throw new NotFoundException('Paiement introuvable');
    }
    const base: Record<string, unknown> = { id: paiementId, is_deleted: false };
    if (user.cite_id) base.cite_id = user.cite_id;

    if (user.role === 'HABITANT' && user.cite_id) {
      const villas = await this.prisma.user_villa.findMany({
        where: { user_id: user.sub, cite_id: user.cite_id, is_current: true, is_deleted: false },
        select: { villa_id: true },
      });
      const villaIds = villas.map((v) => v.villa_id);
      if (villaIds.length === 0) throw new NotFoundException('Paiement introuvable');
      base.villa_id = { in: villaIds };
    }

    const paiement = await this.prisma.paiement.findFirst({
      where: base as any,
      include: {
        villa: { select: { id: true, numero: true, rue: true } },
        statut_paiement: { select: { id: true, libelle: true, code: true } },
        canal_paiement: { select: { id: true, libelle: true, code: true } },
        cite: { select: { id: true, nom: true } },
      },
    });
    if (!paiement) throw new NotFoundException('Paiement introuvable');
    return paiement;
  }

  // ── Reçu PDF ────────────────────────────────────────────
  async getRecu(paiementId: string, citeId: string) {
    const paiement = await this.prisma.paiement.findFirst({
      where: { id: paiementId, cite_id: citeId, is_deleted: false },
    });
    if (!paiement) throw new NotFoundException('Paiement introuvable');

    const recu = await this.prisma.recu_paiement.findFirst({
      where: { paiement_id: paiementId, is_deleted: false },
    });

    if (recu) {
      const bucket = String(await this.appConfigValue('MINIO_BUCKET_DOCUMENTS', 'mysyndic-documents'));
      const url = await this.storage.getPresignedUrl(bucket, recu.file_path, 3600);
      return this.recuResponse(recu.file_path, url, 'cache');
    }

    try {
      const villa = await this.prisma.villa.findFirstOrThrow({ where: { id: paiement.villa_id } });
      const canal = await this.prisma.canal_paiement.findFirst({ where: { id: paiement.canal_id ?? 0 } });
      await this.generateReceipt({
        paiementId: paiement.id,
        cite_id: citeId,
        villa,
        mois: paiement.mois,
        montant: paiement.montant,
        canal: canal?.code ?? 'PAIEMENT',
      });
      const gen = await this.prisma.recu_paiement.findFirstOrThrow({ where: { paiement_id: paiementId } });
      const bucket = String(await this.appConfigValue('MINIO_BUCKET_DOCUMENTS', 'mysyndic-documents'));
      const url = await this.storage.getPresignedUrl(bucket, gen.file_path, 3600);
      return this.recuResponse(gen.file_path, url, 'generated');
    } catch (e) {
      this.logger.error(`Recu generation failed: ${String(e)}`);
      throw new BadRequestException('Reçu indisponible pour le moment');
    }
  }

  private recuResponse(filePath: string, presignedUrl: string, via: string) {
    return {
      file_path: filePath,
      url: presignedUrl,
      preview_url: `/api/files/preview?path=${encodeURIComponent(filePath)}`,
      via,
    };
  }

  private async generateReceipt(params: {
    paiementId: string;
    cite_id: string;
    villa: { id: string; numero: string; rue: string | null };
    mois: string;
    montant: number;
    canal: string;
  }) {
    const cite = await this.prisma.cite.findFirstOrThrow({ where: { id: params.cite_id } });
    const token = crypto.randomUUID();
    const verifyUrl = `${this.config.get('FRONTEND_URL') || 'http://localhost:5173'}/verify/${token}`;

    const buffer = await this.receiptImage.generateReceipt({
      citeNom: cite.nom,
      villaNumero: params.villa.numero,
      villaRue: params.villa.rue,
      mois: params.mois,
      montant: params.montant,
      canal: params.canal,
      reference: params.paiementId,
      dateConfirmation: new Date(),
      qrToken: token,
      verifyUrl,
    });

    const bucket = String(await this.appConfigValue('MINIO_BUCKET_DOCUMENTS', 'mysyndic-documents'));
    const objectName = `recus/${params.cite_id}/${params.mois}/${params.paiementId}-${Date.now()}.png`;
    await this.storage.uploadFile(bucket, objectName, buffer, 'image/png');

    await this.prisma.recu_paiement.create({
      data: {
        paiement_id: params.paiementId,
        cite_id: params.cite_id,
        villa_id: params.villa.id,
        file_path: objectName,
        qr_code_token: token,
        generated_at: new Date(),
        created_at: new Date(),
      },
    });

    return objectName;
  }

  // ── Export Excel ────────────────────────────────────────
  async exportExcel(citeId: string) {
    const rows = await this.prisma.paiement.findMany({
      where: { cite_id: citeId, is_deleted: false },
      include: {
        villa: true,
        canal_paiement: true,
        statut_paiement: true,
        user: { select: { nom: true, prenom: true } },
      },
      orderBy: { mois: 'desc' },
    });

    return this.excel.exportPaiements(
      rows.map((r) => ({
        villa_numero: r.villa?.numero ?? '',
        villa_rue: r.villa?.rue,
        mois: r.mois,
        montant: r.montant,
        canal: r.canal_paiement?.code ?? '',
        statut: r.statut_paiement?.code ?? '',
        date: r.created_at ?? new Date(),
        saisi_par: r.user ? `${r.user.prenom} ${r.user.nom}` : null,
      })),
    );
  }

  // ── Helpers ─────────────────────────────────────────────
  private async appConfigValue(key: string, def: string | number) {
    const row = await this.prisma.app_config.findUnique({
      where: { key },
    });
    return row?.value ?? String(def);
  }
}