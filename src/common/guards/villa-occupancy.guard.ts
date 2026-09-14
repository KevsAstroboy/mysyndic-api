import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest } from '../types/authenticated-request.interface';

const VILLA_EN_ATTENTE = {
  code: 'VILLA_OCCUPATION_EN_ATTENTE',
  message:
    'Votre occupation de villa est en attente de validation par le syndic ou les occupants de la villa.',
};

const VILLA_ABSENTE = {
  code: 'VILLA_OCCUPATION_EN_ATTENTE',
  message:
    'Aucune villa confirmée : cette action nécessite une occupation de villa validée.',
};

/**
 * Gate les actions « pour la villa » réservées aux occupants confirmés.
 *
 * - Profil actif ≠ HABITANT (SYNDIC/ADMIN/SA/CHEF) : laissé passer — le
 *   RbacGuard décide ensuite via les features.
 * - HABITANT : exige une user_villa courante active dans la cité active ET
 *   confirmée (is_confirme=true). Une candidature en attente ou l'absence de
 *   villa => 403. Un token connecté ne prouve jamais l'occupation.
 */
@Injectable()
export class VillaOccupancyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentification requise');
    }

    if (user.role !== 'HABITANT') {
      return true;
    }

    const citeId = user.cite_id;
    if (!citeId) {
      throw new ForbiddenException(VILLA_ABSENTE);
    }

    const uv = await this.prisma.user_villa.findFirst({
      where: {
        user_id: user.sub,
        cite_id: citeId,
        is_current: true,
        is_deleted: false,
      },
      select: { id: true, is_confirme: true },
    });

    if (!uv) {
      throw new ForbiddenException(VILLA_ABSENTE);
    }
    if (!uv.is_confirme) {
      throw new ForbiddenException(VILLA_EN_ATTENTE);
    }

    return true;
  }
}
