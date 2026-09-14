import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Body,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/guards/must-change-password.guard';
import { verifyHmacSignature } from './hmac.util';
import { WebhookService } from './webhook.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Post('paystack')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réception webhook Paystack (publique, HMAC)' })
  async paystack(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-paystack-signature') signature: string | undefined,
  ) {
    const raw = (req as any).rawBody;
    const rawBody: string = Buffer.isBuffer(raw)
      ? raw.toString()
      : JSON.stringify(req.body ?? {});
    const payload = req.body as any;

    const reference = payload?.data?.reference ?? payload?.reference ?? null;

    // Secret HMAC résolu dynamiquement depuis app_config (fallback .env).
    const secret = await this.webhookService.paystackWebhookSecret();

    const signatureOk = secret
      ? verifyHmacSignature(rawBody, signature, secret)
      : false;

    const aggregateur = 'PAYSTACK';

    if (!signatureOk) {
      await this.webhookService.storePayload({
        aggregateur_code: aggregateur,
        event: payload?.event ?? 'unknown',
        reference: reference ?? 'unknown',
        signature_ok: false,
        payload_requete: rawBody,
        erreur: 'SIGNATURE_INVALIDE',
      }).catch(() => undefined);
      this.logger.warn('Webhook Paystack signature invalide');
      res.status(HttpStatus.UNAUTHORIZED);
      return { error: 'Invalid signature' };
    }

    // 200 immédiat après vérif signature (avant traitement)
    await this.webhookService.storePayload({
      aggregateur_code: aggregateur,
      event: payload?.event ?? 'unknown',
      reference: reference ?? 'unknown',
      signature_ok: true,
      payload_requete: rawBody,
    }).catch(() => undefined);

    // traitement asynchrone — on ne bloque pas la réponse
    setImmediate(() => {
      this.webhookService
        .processPaystack(payload)
        .catch((e) => this.logger.error(`processPaystack failed: ${String(e)}`));
    });

    return { received: true };
  }
}