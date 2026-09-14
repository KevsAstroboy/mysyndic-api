import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaystackClientService } from '../paiement/paystack-client.service';
import { CreateSubaccountDto, UpdateConfigurationDto } from './dto/configuration.dto';

@Injectable()
export class ConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackClientService,
  ) {}

  // GET /configuration — config de la cité, clés secrètes masquées partiellement
  async findByCiteId(citeId: string) {
    const config = await this.prisma.configuration.findFirst({
      where: { cite_id: citeId, is_deleted: false },
    });
    if (!config) throw new NotFoundException('Configuration introuvable pour cette cité');

    // « Qui a modifié la dernière fois ? » — nom du dernier éditeur, sans relations Prisma.
    const modifier =
      config.updated_by != null
        ? await this.prisma.user.findUnique({
            where: { id: config.updated_by },
            select: { id: true, prenom: true, nom: true },
          })
        : null;

    return {
      ...config,
      paystack_subaccount_code: config.paystack_subaccount_code
        ? this.mask(config.paystack_subaccount_code)
        : null,
      modifier: modifier
        ? { id: modifier.id, prenom: modifier.prenom, nom: modifier.nom }
        : null,
      modifier_at: config.updated_at,
    };
  }

  // PATCH /configuration — admin/config (le dernier éditeur est tracé)
  async update(citeId: string, dto: UpdateConfigurationDto, actorId: string) {
    const existing = await this.prisma.configuration.findFirst({
      where: { cite_id: citeId, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('Configuration introuvable pour cette cité');

    if (dto.paystack_subaccount_mode === 'SPLIT' && !dto.paystack_subaccount_code) {
      throw new BadRequestException('Le subaccount code est requis en mode SPLIT');
    }

    return this.prisma.configuration.update({
      where: { id: existing.id },
      data: {
        ...(dto.cotisation_mensuelle !== undefined && { cotisation_mensuelle: dto.cotisation_mensuelle }),
        ...(dto.lien_wave !== undefined && { lien_wave: dto.lien_wave }),
        ...(dto.telephone_syndic !== undefined && { telephone_syndic: dto.telephone_syndic }),
        ...(dto.telephone_urgence !== undefined && { telephone_urgence: dto.telephone_urgence }),
        ...(dto.paystack_subaccount_code !== undefined && { paystack_subaccount_code: dto.paystack_subaccount_code }),
        ...(dto.paystack_subaccount_mode !== undefined && { paystack_subaccount_mode: dto.paystack_subaccount_mode }),
        ...(dto.paystack_subaccount_split !== undefined && { paystack_subaccount_split: dto.paystack_subaccount_split }),
        ...(dto.nombre_villas_attendu !== undefined && { nombre_villas_attendu: dto.nombre_villas_attendu }),
        updated_by: actorId,
        updated_at: new Date(),
      },
    });
  }

  // POST /configuration/paystack/subaccount — le super admin crée le sous-compte
  // Paystack de la cité ; le code est persisté automatiquement (mode SPLIT).
  async createPaystackSubaccount(citeId: string, dto: CreateSubaccountDto, actorId: string) {
    const existing = await this.prisma.configuration.findFirst({
      where: { cite_id: citeId, is_deleted: false },
    });
    if (!existing) throw new NotFoundException('Configuration introuvable pour cette cité');

    const { subaccount_code: code } = await this.paystack.createSubaccount({
      businessName: dto.business_name,
      settlementBank: dto.settlement_bank,
      accountNumber: dto.account_number,
      percentageCharge: dto.percentage_charge,
      primaryContactEmail: dto.primary_contact_email,
    });

    await this.prisma.configuration.update({
      where: { id: existing.id },
      data: {
        paystack_subaccount_code: code,
        paystack_subaccount_mode: 'SPLIT',
        updated_by: actorId,
        updated_at: new Date(),
      },
    });

    return { paystack_subaccount_code: this.mask(code) };
  }

  private mask(code: string): string {
    if (code.length <= 4) return '****';
    return `${code.slice(0, 4)}****${code.slice(-4)}`;
  }
}