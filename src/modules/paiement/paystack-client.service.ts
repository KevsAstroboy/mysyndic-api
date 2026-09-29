import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface InitializePaymentParams {
  amount: number;
  email: string;
  reference: string;
  subaccount?: string | null;
  subaccountMode?: 'SIMPLE' | 'SPLIT' | null;
  subaccountSplit?: number | null;
  currency?: string | null;
  callbackUrl?: string;
}

export interface PaystackInitializeResponse {
  authorization_url: string;
  reference: string;
}

@Injectable()
export class PaystackClientService {
  private readonly logger = new Logger(PaystackClientService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get baseUrl() {
    return this.config.get('PAYSTACK_BASE_URL') || 'https://api.paystack.co';
  }

  /** Valeur app_config, sinon fallback (env). */
  private async appConfigValue(key: string, def: string): Promise<string> {
    const row = await this.prisma.app_config.findUnique({ where: { key } });
    return row?.value || def;
  }

  /**
   * Clé secrète Paystack résolue dynamiquement.
   * Priorité : app_config.PAYSTACK_SECRET_KEY → env PAYSTACK_SECRET_KEY.
   * Lève si aucune n'est configurée.
   */
  private async secretKey(): Promise<string> {
    const key = await this.appConfigValue(
      'PAYSTACK_SECRET_KEY',
      this.config.get<string>('PAYSTACK_SECRET_KEY') || '',
    );
    if (!key) {
      throw new Error('PAYSTACK_SECRET_KEY non configurée (app_config ou .env)');
    }
    return key;
  }

  private get callbackUrl() {
    return (
      this.config.get('PAYSTACK_CALLBACK_URL') ||
      `${this.config.get('FRONTEND_URL') || 'http://localhost:5173'}/paiements/confirmation`
    );
  }

  /** Erreurs réseau transitoires (VPN, DNS, connexion) → on peut réessayer. */
  private static readonly RETRYABLE = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
  ]);

  /**
   * `fetch` vers Paystack avec délai borné et ré-essais. Le poste de dev est
   * derrière un VPN qui route par intermittence vers api.paystack.co (Cloudflare)
   * → sans ça, un simple hoquet réseau fait échouer l'initialisation du paiement.
   */
  private async request(
    url: string,
    init: RequestInit,
    attempts = 3,
  ): Promise<Response> {
    let lastErr: unknown;
    for (let i = 1; i <= attempts; i++) {
      try {
        return await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(10_000),
        });
      } catch (e) {
        lastErr = e;
        const code = (e as { cause?: { code?: string } })?.cause?.code;
        const name = (e as Error).name;
        const retryable = !code || PaystackClientService.RETRYABLE.has(code) || name === 'TimeoutError';
        this.logger.warn(
          `Paystack requête ${i}/${attempts} échouée (${code ?? name})`,
        );
        if (i < attempts && retryable) {
          await new Promise((r) => setTimeout(r, 300 * i));
          continue;
        }
        break;
      }
    }
    this.logger.error(`Paystack injoignable: ${String(lastErr)}`);
    throw new Error(
      'Service de paiement injoignable pour le moment. Vérifiez la connexion et réessayez.',
    );
  }

  async initializePayment(
    params: InitializePaymentParams,
  ): Promise<PaystackInitializeResponse> {
    const currency =
      params.currency ??
      (await this.appConfigValue(
        'PAYSTACK_CURRENCY',
        this.config.get<string>('PAYSTACK_CURRENCY') || 'XOF',
      ));
    const body: Record<string, unknown> = {
      amount: Math.round(params.amount * 100),
      email: params.email,
      reference: params.reference,
      callback_url: params.callbackUrl ?? this.callbackUrl,
      currency,
    };
    if (params.subaccount) {
      body.subaccount = params.subaccount;
      if (params.subaccountMode === 'SPLIT') {
        const splitValue = params.subaccountSplit ?? 100;
        body.split = {
          type: 'percentage',
          value: splitValue,
          bearer_subaccount: params.subaccount,
        };
      } else {
        body.bearer = 'account';
      }
    }

    const res = await this.request(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.secretKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; reference?: string };
    };

    if (!res.ok || !data.status || !data.data?.authorization_url) {
      this.logger.error(
        `Paystack initialize failed (${res.status}): ${data.message}`,
      );
      throw new Error(
        data.message || 'Erreur lors de l initialisation du paiement Paystack',
      );
    }

    return {
      authorization_url: data.data.authorization_url,
      reference: data.data.reference ?? params.reference,
    };
  }

  async verifyTransaction(reference: string): Promise<{
    status: boolean;
    amount?: number;
    email?: string;
  }> {
    const res = await this.request(`${this.baseUrl}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${await this.secretKey()}` },
    });

    const data = (await res.json()) as {
      status?: boolean;
      data?: { status?: string; amount?: number; customer?: { email?: string } };
    };

    if (!res.ok || !data.status) {
      throw new Error('Échec de vérification de la transaction Paystack');
    }

    return {
      status: data.data?.status === 'success',
      amount: data.data?.amount ?? 0,
      email: data.data?.customer?.email ?? '',
    };
  }

  /**
   * Crée un subaccount Paystack (habituellement le super admin). La cité devient
   * un sous-compte qui encaisse ses paiements ; on retourne le code à persister.
   */
  async createSubaccount(params: {
    businessName: string;
    settlementBank: string;
    accountNumber: string;
    percentageCharge?: number;
    primaryContactEmail?: string;
  }): Promise<{ subaccount_code: string; integration_details?: Record<string, unknown> }> {
    const body: Record<string, unknown> = {
      business_name: params.businessName,
      settlement_bank: params.settlementBank,
      account_number: params.accountNumber,
      percentage_charge: params.percentageCharge ?? 0,
    };
    if (params.primaryContactEmail) body.primary_contact_email = params.primaryContactEmail;

    const res = await this.request(`${this.baseUrl}/subaccount`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.secretKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { subaccount_code?: string; integration_details?: Record<string, unknown> };
    };

    if (!res.ok || !data.status || !data.data?.subaccount_code) {
      // Erreur de validation Paystack (compte/banque) → 400 lisible, pas un 500.
      throw new BadRequestException(
        data?.message ||
          `Échec de création du sous-compte Paystack (${res.status})`,
      );
    }

    return {
      subaccount_code: data.data.subaccount_code,
      integration_details: data.data.integration_details,
    };
  }
}