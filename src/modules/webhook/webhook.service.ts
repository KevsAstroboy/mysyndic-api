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

    // met à jour montants sur le webhook (déjà stocké)
    const paiement = await this.prisma.paiement.findFirst({
      where: {
        is_deleted: false,
        ...(isUuid
          ? { OR: [{ id: reference }, { reference_paystack: reference }] }
          : { reference_paystack: reference }),
      },
      include: { villa: true },
    });

    if (!paiement) {
      this.logger.warn(`Webhook Paystack référence inconnue: ${reference}`);
      return;
    }

    const montantAttendu = paiement.montant;
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

    // idempotence logique
    if (paiement.statut_id === 2) {
      this.logger.log(`Paiement déjà confirmé, skip: ${paiement.id}`);
      return;
    }

    if (montantRecu !== montantAttendu) {
      this.logger.warn(
        `Montant mismatch webhook: attendu ${montantAttendu}, reçu ${montantRecu} (${paiement.id})`,
      );
      return;
    }

    // Confirmer
    await this.prisma.$transaction(async (tx) => {
      await tx.paiement.update({
        where: { id: paiement.id },
        data: { statut_id: 2, updated_at: new Date() },
      });
      await tx.webhook.updateMany({
        where: { reference, aggregateur_code: 'PAYSTACK' },
        data: { traite: true, traite_at: new Date(), erreur: null, updated_at: new Date() },
      });
      await tx.audit_log.create({
        data: {
          cite_id: paiement.cite_id,
          user_id: paiement.saisi_par ?? undefined,
          action: 'UPDATE',
          entite: 'paiement',
          entite_id: paiement.id,
          created_at: new Date(),
        } as any,
      });
    });

    // Notification occupants
    const occupants = await this.prisma.user_villa.findMany({
      where: { villa_id: paiement.villa_id, is_current: true, is_deleted: false },
      select: { user_id: true },
    });
    await Promise.all(
      occupants.map((o) =>
        this.prisma.notification.create({
          data: {
            cite_id: paiement.cite_id,
            user_id: o.user_id,
            titre: 'Paiement confirmé',
            message: `Votre paiement de ${montantAttendu} FCFA pour ${paiement.mois} a été confirmé.`,
            created_at: new Date(),
          } as any,
        }),
      ),
    ).catch((e) => this.logger.warn(`Notifications overflow: ${String(e)}`));

    this.logger.log(`Paiement confirmé via webhook: ${paiement.id}`);
  }
}