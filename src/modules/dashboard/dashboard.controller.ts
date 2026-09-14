import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequireFeature('PAIEMENT_READ_ALL')
  @ApiOperation({
    summary: 'KPIs du tableau de bord (syndic/admin)',
    description:
      'Habitants, occupants confirmés, villas, recouvrement et impayés, scopés à la cité active. Filtres optionnels : mois=YYYY-MM, ou debut/fin (plage).',
  })
  @ApiResponse({ status: 200, description: 'Résumé KPI' })
  @ApiResponse({ status: 403, description: 'Cité requise / permission refusée' })
  summary(
    @Query('mois') mois: string | undefined,
    @Query('debut') debut: string | undefined,
    @Query('fin') fin: string | undefined,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.dashboardService.summary(req.user.cite_id, { mois, debut, fin });
  }
}
