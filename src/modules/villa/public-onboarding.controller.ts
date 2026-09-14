import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { VillaService } from '../villa/villa.service';
import { Public } from '../../common/guards/must-change-password.guard';

/**
 * Découverte publique pour l'onboarding (sélection cité + villa).
 * Aucune donnée personnelle des occupants. Le statut d'une villa est
 * dérivé de user_villa (libre / occupée / en attente).
 */
@ApiTags('Public (onboarding)')
@Controller('public')
export class PublicOnboardingController {
  constructor(private readonly villaService: VillaService) {}

  @Get('cites')
  @Public()
  @ApiOperation({ summary: 'Cités disponibles (inscription/candidature)' })
  listCites() {
    return this.villaService.listPublicCites();
  }

  @Get('cites/:citeId/villas')
  @Public()
  @ApiOperation({
    summary: 'Villas d\'une cité + statut d\'occupation',
    description: 'statut: libre | occupee | en_attente. Aucune donnée des occupants.',
  })
  listVillas(@Param('citeId') citeId: string) {
    return this.villaService.listPublicVillas(citeId);
  }
}
