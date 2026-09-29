import {
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';

export interface StoredWebhookPayload {
  aggregateur_code: string;
  event: string;
  reference: string;
  signature_ok: boolean;
  payload_requete: string;
  montant_attendu?: number;
  montant_recu?: number;
  erreur?: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  /**
   * Secret HMAC de vérification des webhooks Paystack, résolu dynamiquement.
   * Paystack signe avec la clé SECRÈTE du compte (pas de secret webhook dédié).
   * Priorité : app_config.PAYSTACK_SECRET_KEY → env PAYSTACK_SECRET_KEY.
   */
  async paystackWebhookSecret(): Promise<string> {
    const row = await this.prisma.app_config.findUnique({
      where: { key: 'PAYSTACK_SECRET_KEY' },
    });
    if (row?.value) return row.value;
    return this.config.get<string>('PAYSTACK_SECRET_KEY') || '';
  }

  /**
   * Enregistre le webhook réçu. UNIQUE(aggregateur_code, reference) garantit
   * l'idempotence : un doublon (P2002) est avalé silencieusement.
   */
  async storePayload(payload: StoredWebhookPayload): Promise<{ stored: boolean }> {
    try {
      await this.prisma.webhook.create({
        data: {
          aggregateur_code: payload.aggregateur_code,
          event: payload.event,
          reference: payload.reference,
          signature_ok: payload.signature_ok,
          payload_requete: payload.payload_requete,
          montant_attendu: payload.montant_attendu,
          montant_recu: payload.montant_recu,
          erreur: payload.erreur,
          created_at: new Date(),
        } as any,
      });
      return { stored: true };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        this.logger.log(`Webhook dupliqué ignoré (${payload.aggregateur_code}/${payload.reference})`);
        return { stored: false };
      }
      this.logger.error(`Webhook store failed: ${String(e)}`);
      throw e;
    }
  }

  /**
   * Traitement asynchrone d'un payload Paystack charge.success :
   * - référence = paiement.id
   * - trouve le paiement EN_ATTENTE, vérifie montant
   * - si match → CONFIRME + reçu (généré par PaiementService plus tard) + audit
   * Idempotence logique : un paiement déjà CONFIRME est ignoré.
   */
  async processPaystack(payload: any): Promise<void> {
    const reference = payload?.data?.reference ?? payload?.reference;
    const event = payload?.event ?? '';
    const amount = payload?.data?.amount; // en kobo/centimes (XOF pesewas → *100)

    if (!reference) {
      this.logger.warn('Webhook Paystack sans reference');
      return;
    }

    // La référence Paystack peut être l'id du paiement (legacy) ou une référence
    // unique suffixée. On ne filtre sur `id` que si c'est un UUID valide, sinon
    // Prisma tente un cast UUID sur une chaîne invalide et lève une erreur.
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        reference,
      );

    // Multi-mois : UNE référence Paystack peut couvrir PLUSIEURS paiements
    // (un par mois, même reference_paystack). On récupère tous les concernés.
    const paiements = await this.prisma.paiement.findMany({
      where: {
        is_deleted: false,
        ...(isUuid
          ? { OR: [{ id: reference }, { reference_paystack: reference }] }
          : { reference_paystack: reference }),
      },
    });

    if (!paiements || paiements.length === 0) {
      this.logger.warn(`Webhook Paystack référence inconnue: ${reference}`);
      return;
    }

    const montantAttendu = paiements.reduce((s, p) => s + p.montant, 0);
    const montantRecu = amount ? Math.round(amount / 100) : null;

    // mise à jour webhook montants (montant_match calculé par la DB)
    await this.prisma.webhook.updateMany({
      where: { reference, aggregateur_code: 'PAYSTACK' },
      data: { montant_attendu: montantAttendu, montant_recu: montantRecu, updated_at: new Date() },
    }).catch(() => undefined);

    if (event !== 'charge.success') {
      this.logger.log(`Événement non confirmant ignoré: ${event}`);
      return;
    }

    // Idempotence logique : on ne re-confirme que ceux pas encore confirmés.
    const aConfirmer = paiements.filter((p) => p.statut_id !== 2);
    if (aConfirmer.length === 0) {
      this.logger.log(`Paiements déjà confirmés, skip: ${reference}`);
      return;
    }

    if (montantRecu !== montantAttendu) {
      this.logger.warn(
        `Montant mismatch webhook: attendu ${montantAttendu}, reçu ${montantRecu} (${reference})`,
      );
      return;
    }

    // Confirmer tous les paiements rattachés à la référence
    await this.prisma.$transaction(async (tx) => {
      await tx.paiement.updateMany({
        where: {
          id: { in: aConfirmer.map((p) => p.id) },
          statut_id: { not: 2 },
        },
        data: { statut_id: 2, updated_at: new Date() },
      });
      await tx.webhook.updateMany({
        where: { reference, aggregateur_code: 'PAYSTACK' },
        data: { traite: true, traite_at: new Date(), erreur: null, updated_at: new Date() },
      });
      await tx.audit_log.createMany({
        data: aConfirmer.map((p) => ({
          cite_id: p.cite_id,
          user_id: p.saisi_par ?? undefined,
          action: 'UPDATE',
          entite: 'paiement',
          entite_id: p.id,
          created_at: new Date(),
        })) as any,
      });
    });

    // Notification occupants (une par mois confirmé)
    const villaIds = [...new Set(aConfirmer.map((p) => p.villa_id))];
    const occupants = await this.prisma.user_villa.findMany({
      where: { villa_id: { in: villaIds }, is_current: true, is_deleted: false },
      select: { villa_id: true, user_id: true },
    });
    const notifs = aConfirmer.flatMap((p) =>
      occupants
        .filter((o) => o.villa_id === p.villa_id)
        .map((o) => ({
          cite_id: p.cite_id,
          user_id: o.user_id,
          titre: 'Paiement confirmé',
          message: `Votre paiement de ${p.montant} FCFA pour ${p.mois} a été confirmé.`,
          created_at: new Date(),
        })),
    );
    await this.prisma.notification
      .createMany({ data: notifs as any })
      .catch((e) => this.logger.warn(`Notifications overflow: ${String(e)}`));

    this.logger.log(
      `Paiement(s) confirmé(s) via webhook: ${aConfirmer.map((p) => p.id).join(', ')}`,
    );
  }
}