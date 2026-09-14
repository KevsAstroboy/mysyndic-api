import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { VillaService } from './villa.service';
import {
  CreateVillaDto,
  UpdateVillaDto,
  AssignUserDto,
  CandidatureVillaDto,
} from './dto/villa.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { CriteriaService } from '../../common/criteria/criteria.service';

@ApiTags('Villas')
@Controller('villas')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class VillaController {
  constructor(
    private readonly villaService: VillaService,
    private readonly criteria: CriteriaService,
  ) {}

  @Get()
  @RequireFeature('HABITANT_READ')
  @ApiOperation({ summary: 'Lister les villas (cité active ; SA sans cité = toutes)' })
  @ApiResponse({ status: 200, description: 'Liste villas' })
  findAll(@Request() req: AuthenticatedRequest) {
    return this.villaService.findAll(req.user.cite_id);
  }

  @Get('get-by-criteria')
  @RequireFeature('HABITANT_READ')
  @ApiOperation({
    summary: 'Villas — DSL critères paginé',
    description: 'Filtrage par champs (ex. numero, cite_id), sort, fields, include, page, size, logic. SA sans cité = toutes les cités.',
  })
  getByCriteria(@Query() query: Record<string, string>, @Request() req: AuthenticatedRequest) {
    return this.criteria.paginate('villa', query, {
      ...(req.user.cite_id ? { cite_id: req.user.cite_id } : {}),
      is_deleted: false,
    });
  }

  // ── Candidature auto (connecté, possible cross-cité) ────────
  @Post('candidatures')
  @ApiOperation({
    summary: 'Candidater à une occupation de villa',
    description:
      'Villa libre -> candidature « première occupation » (validée par le syndic). Villa occupée -> candidature colocataire (validée par un occupant confirmé). Crée/active le profil HABITANT de la cité cible si absent.',
  })
  @ApiBody({ type: CandidatureVillaDto })
  @ApiResponse({ status: 201, description: 'Candidature en attente', schema: { example: { user_villa_id: 'uuuu', occupation_en_attente: true } } })
  @ApiResponse({ status: 409, description: 'Villa en cours d\'attribution ou déjà lié dans la cité' })
  candidater(@Body() dto: CandidatureVillaDto, @Request() req: AuthenticatedRequest) {
    return this.villaService.candidater(req.user.sub, dto.villa_id);
  }

  // ── Circuit syndic : première occupation ────────────────────
  @Get('mes-candidatures')
  @ApiOperation({
    summary: 'Mes candidatures en attente (toutes cités)',
    description: 'Renvoie les demandes d\'occupation en attente du user connecté (colocation ou première occupation).',
  })
  @ApiResponse({ status: 200, description: 'Liste de mes candidatures' })
  mesCandidatures(@Request() req: AuthenticatedRequest) {
    return this.villaService.mesCandidatures(req.user.sub);
  }

  @Get('candidatures')
  @RequireFeature('VILLA_GERER_CANDIDATURES')
  @ApiOperation({ summary: 'Candidatures « première occupation » (syndic)' })
  @ApiResponse({ status: 200, description: 'Candidatures en attente de validation syndic' })
  listCandidaturesPremiere(@Request() req: AuthenticatedRequest) {
    return this.villaService.listCandidaturesPremiere(req.user.cite_id!);
  }

  @Post('candidatures/:userVillaId/confirmer')
  @RequireFeature('VILLA_GERER_CANDIDATURES')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmer une première occupation (syndic)' })
  @ApiResponse({ status: 200, description: 'Confirmé' })
  confirmerPremiere(@Param('userVillaId') userVillaId: string, @Request() req: AuthenticatedRequest) {
    return this.villaService.confirmerPremiere(userVillaId, { id: req.user.sub, cite_id: req.user.cite_id! });
  }

  @Post('candidatures/:userVillaId/refuser')
  @RequireFeature('VILLA_GERER_CANDIDATURES')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refuser une première occupation (syndic)' })
  @ApiResponse({ status: 200, description: 'Refusé — villa retirée, compte conservé' })
  refuserPremiere(@Param('userVillaId') userVillaId: string, @Request() req: AuthenticatedRequest) {
    return this.villaService.refuserPremiere(userVillaId, { id: req.user.sub, cite_id: req.user.cite_id! });
  }

  @Get(':id')
  @RequireFeature('HABITANT_READ')
  @ApiOperation({ summary: 'Détail villa avec occupants + historique paiements' })
  @ApiResponse({ status: 200, description: 'Villa détaillée' })
  @ApiResponse({ status: 404, description: 'Villa introuvable' })
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.villaService.findOne(id, req.user.cite_id);
  }

  @Post()
  @RequireFeature('ADMIN_CONFIG_CITE')
  @ApiOperation({ summary: 'Créer une villa' })
  @ApiBody({ type: CreateVillaDto })
  @ApiResponse({ status: 201, description: 'Villa créée' })
  @ApiResponse({ status: 409, description: 'Numéro déjà existant' })
  create(@Body() dto: CreateVillaDto, @Request() req: AuthenticatedRequest) {
    return this.villaService.create(req.user.cite_id!, dto);
  }

  @Patch(':id')
  @RequireFeature('ADMIN_CONFIG_CITE')
  @ApiOperation({ summary: 'Mettre à jour une villa' })
  @ApiBody({ type: UpdateVillaDto })
  @ApiResponse({ status: 200, description: 'Villa mise à jour' })
  update(@Param('id') id: string, @Body() dto: UpdateVillaDto, @Request() req: AuthenticatedRequest) {
    return this.villaService.update(id, req.user.cite_id!, dto);
  }

  @Post(':id/assign-user')
  @RequireFeature('HABITANT_UPDATE_VILLA')
  @ApiOperation({
    summary: 'Assigner un user à une villa',
    description:
      "Intra-cité : occupation confirmée immédiatement. User d'une autre cité : dépose une candidature soumise aux occupants (villa occupée) ou au syndic (première occupation) — acceptée ou refusée par ceux-ci.",
  })
  @ApiBody({ type: AssignUserDto })
  @ApiResponse({ status: 201, description: 'Assigné (intra-cité) ou candidature déposée (cross-cité)' })
  @ApiResponse({ status: 409, description: 'Villa en cours d\'attribution ou cité désactivée' })
  assignUser(@Param('id') id: string, @Body() dto: AssignUserDto, @Request() req: AuthenticatedRequest) {
    return this.villaService.assignUser(id, req.user.cite_id!, dto, req.user.sub);
  }

  @Delete(':id/unassign-user/:userId')
  @RequireFeature('HABITANT_UPDATE_VILLA')
  @ApiOperation({ summary: 'Désassigner un user de la villa' })
  @ApiResponse({ status: 200, description: 'Désassigné' })
  unassignUser(@Param('id') id: string, @Param('userId') userId: string, @Request() req: AuthenticatedRequest) {
    return this.villaService.unassignUser(id, req.user.cite_id!, userId, req.user.sub);
  }

  // ── Circuit colocataires (occupants confirmés de la villa) ──
  @Get(':id/candidatures')
  @ApiOperation({ summary: 'Candidatures colocataires en attente de cette villa' })
  @ApiResponse({ status: 200, description: 'Candidatures' })
  listCandidaturesVilla(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.villaService.listCandidaturesVilla(id, req.user.sub, req.user.cite_id!);
  }

  @Post(':id/candidatures/:userVillaId/valider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valider un colocataire (occupant confirmé)' })
  @ApiResponse({ status: 200, description: 'Colocataire confirmé' })
  validerColocataire(@Param('id') id: string, @Param('userVillaId') userVillaId: string, @Request() req: AuthenticatedRequest) {
    return this.villaService.validerColocataire(id, userVillaId, { id: req.user.sub, cite_id: req.user.cite_id! });
  }

  @Post(':id/candidatures/:userVillaId/refuser')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refuser un colocataire (occupant confirmé)' })
  @ApiResponse({ status: 200, description: 'Refusé' })
  refuserColocataire(@Param('id') id: string, @Param('userVillaId') userVillaId: string, @Request() req: AuthenticatedRequest) {
    return this.villaService.refuserColocataire(id, userVillaId, { id: req.user.sub, cite_id: req.user.cite_id! });
  }

  @Post(':id/candidatures/me/annuler')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annuler sa propre candidature en attente' })
  @ApiResponse({ status: 200, description: 'Annulée' })
  annulerCandidature(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.villaService.annulerCandidature(id, req.user.sub, req.user.cite_id!);
  }

  // ── Gestion des occupants (occupants confirmés de la villa) ─
  @Get(':id/occupants')
  @ApiOperation({ summary: 'Occupants confirmés de la villa' })
  @ApiResponse({ status: 200, description: 'Liste occupants' })
  listOccupants(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.villaService.listOccupants(id, req.user.sub, req.user.cite_id!);
  }

  @Post(':id/occupants/:userId/retirer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirer un autre occupant confirmé' })
  @ApiResponse({ status: 200, description: 'Retiré' })
  retirerOccupant(@Param('id') id: string, @Param('userId') userId: string, @Request() req: AuthenticatedRequest) {
    return this.villaService.retirerOccupant(id, userId, { id: req.user.sub, cite_id: req.user.cite_id! });
  }

  @Post(':id/occupants/me/partir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quitter volontairement la villa' })
  @ApiResponse({ status: 200, description: 'Quitté — villa libre si dernier occupant' })
  mePartir(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.villaService.mePartir(id, req.user.sub, req.user.cite_id!);
  }
}
