import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  Res,
  UseGuards,
  ForbiddenException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { PaiementService } from './paiement.service';
import { InitPaystackDto, PaiementManuelDto } from './dto/paiement.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { VillaOccupancyGuard } from '../../common/guards/villa-occupancy.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { CriteriaService } from '../../common/criteria/criteria.service';

@ApiTags('Paiements')
@Controller('paiements')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class PaiementController {
  constructor(
    private readonly paiementService: PaiementService,
    private readonly criteria: CriteriaService,
  ) {}

  @Get('get-by-criteria')
  @RequireFeature('PAIEMENT_READ_ALL')
  @ApiOperation({
    summary: 'Paiements de ma cité — DSL critères paginé',
    description:
      'DSL critères : <champ>.<op>=..., sort=(-)champ, fields=..., include=..., page, size, logic=and|or.',
  })
  async getByCriteria(
    @Query() query: Record<string, string>,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.criteria.paginate('paiement', query, {
      cite_id: req.user.cite_id,
      is_deleted: false,
    });
  }

  @Get('villa/:villaId')
  @ApiOperation({ summary: 'Historique des paiements d une villa' })
  @ApiResponse({ status: 200, description: 'Historique' })
  @ApiResponse({ status: 403, description: 'Non autorisé' })
  historiqueVilla(@Param('villaId') villaId: string, @Request() req: AuthenticatedRequest) {
    return this.paiementService.historiqueVilla(villaId, req.user.cite_id!);
  }

  @Get('impayes')
  @RequireFeature('PAIEMENT_READ_ALL')
  @ApiOperation({ summary: 'Impayés du mois courant' })
  @ApiResponse({ status: 200, description: 'Liste impayés' })
  impayes(@Request() req: AuthenticatedRequest) {
    return this.paiementService.impayesMoisCourant(req.user.cite_id!);
  }

  @Get('recouvrement')
  @RequireFeature('PAIEMENT_READ_ALL')
  @ApiOperation({ summary: 'Statistiques de recouvrement mensuel' })
  @ApiResponse({ status: 200, description: 'Stats' })
  recouvrement(@Request() req: AuthenticatedRequest) {
    return this.paiementService.recouvrementMensuel(req.user.cite_id!);
  }

  @Post('paystack/init')
  @RequireFeature('PAIEMENT_PAYSTACK')
  @UseGuards(VillaOccupancyGuard)
  @ApiOperation({ summary: 'Initier un paiement Paystack' })
  @ApiResponse({ status: 201, description: 'authorization_url + reference' })
  @ApiResponse({ status: 409, description: 'Déjà confirmé' })
  @ApiResponse({ status: 403, description: 'Villa non assignée' })
  initPaystack(@Body() dto: InitPaystackDto, @Request() req: AuthenticatedRequest) {
    return this.paiementService.initPaystack(
      req.user.sub,
      dto,
      req.user.cite_id ?? null,
    );
  }

  @Post('manuel')
  @RequireFeature('PAIEMENT_SAISIE_MANUELLE')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Saisie manuelle multi-mois (syndic)',
    description:
      'Multipart : champs texte + fichier image « preuve » optionnel (jpg/png/webp). Les mois peuvent être répétés (un champ « mois » par mois).',
  })
  @ApiResponse({ status: 201, description: 'Paiements confirmés' })
  @ApiResponse({ status: 400, description: 'Validation' })
  @UseInterceptors(FileInterceptor('preuve'))
  saisieManuelle(
    @Body() dto: PaiementManuelDto,
    @UploadedFile() preuve: Express.Multer.File | undefined,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.paiementService.saisieManuelle(
      { sub: req.user.sub, cite_id: req.user.cite_id },
      dto,
      preuve,
    );
  }

  @Get(':id/recu')
  @RequireFeature('PAIEMENT_DOWNLOAD_RECU')
  @ApiOperation({ summary: 'Reçu PDF (URL signée ou généré)' })
  @ApiResponse({ status: 200, description: 'URL du reçu' })
  @ApiResponse({ status: 404, description: 'Paiement introuvable' })
  recu(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.paiementService.getRecu(id, req.user.cite_id!);
  }

  @Get('export')
  @RequireFeature('PAIEMENT_EXPORT_EXCEL')
  @ApiOperation({ summary: 'Export Excel des paiements' })
  @ApiResponse({ status: 200, description: 'Fichier xlsx' })
  async export(@Res() res: Response, @Request() req: AuthenticatedRequest) {
    const buffer = await this.paiementService.exportExcel(req.user.cite_id!);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="paiements.xlsx"');
    res.send(buffer);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Détail d un paiement par id',
    description: 'Statut après retour Paystack. Scope : staff = cité ; HABITANT = ses villas courantes ; SA = toutes.',
  })
  @ApiResponse({ status: 200, description: 'Paiement détaillé' })
  @ApiResponse({ status: 404, description: 'Paiement introuvable' })
  findOneById(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.paiementService.findOneById(id, {
      sub: req.user.sub,
      cite_id: req.user.cite_id,
      role: req.user.role,
    });
  }
}