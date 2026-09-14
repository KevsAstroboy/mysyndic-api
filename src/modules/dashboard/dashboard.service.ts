import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaiementService } from '../paiement/paiement.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paiement: PaiementService,
  ) {}

  async summary(
    citeId: string | null,
    filter?: { mois?: string; debut?: string; fin?: string },
  ) {
    if (!citeId) {
      throw new ForbiddenException('Cité requise pour le tableau de bord');
    }

    const [villas, occupants, habitants, recouvrement, impayes] =
      await Promise.all([
        this.prisma.villa.count({
          where: { cite_id: citeId, is_deleted: false },
        }),
        this.prisma.user_villa.count({
          where: {
            cite_id: citeId,
            is_confirme: true,
            is_current: true,
            is_deleted: false,
          },
        }),
        this.prisma.user_profil.count({
          where: {
            cite_id: citeId,
            is_active: true,
            is_deleted: false,
            profil: { code: 'HABITANT', is_deleted: false },
          },
        }),
        this.paiement.recouvrementMensuel(citeId, filter),
        this.paiement.impayesMois(citeId, filter),
      ]);

    return {
      cite_id: citeId,
      habitants,
      occupants_confirmes: occupants,
      villas: { total: villas },
      recouvrement,
      impayes,
      generated_at: new Date().toISOString(),
    };
  }
}
