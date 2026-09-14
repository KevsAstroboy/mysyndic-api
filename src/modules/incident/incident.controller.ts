import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Request,
  UseGuards,
  ForbiddenException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { VillaOccupancyGuard } from '../../common/guards/villa-occupancy.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { CriteriaService } from '../../common/criteria/criteria.service';
import { IncidentService } from './incident.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { CommentaireDto } from './dto/commentaire.dto';
import {
  PrendreEnChargeIncidentDto,
  ResoudreIncidentDto,
  NoteSyndicIncidentDto,
} from './dto/update-incident.dto';

@ApiTags('Incidents')
@Controller('incidents')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class IncidentController {
  constructor(
    private readonly incidentService: IncidentService,
    private readonly criteria: CriteriaService,
  ) {}

  @Post()
  @RequireFeature('INCIDENT_CREATE')
  @UseGuards(VillaOccupancyGuard)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Signaler un incident',
    description: 'Champs texte + photo optionnelle (multipart, champ fichier « photo »).',
  })
  @ApiResponse({ status: 201, description: 'Incident signalé' })
  @UseInterceptors(FileInterceptor('photo'))
  create(
    @Body() dto: CreateIncidentDto,
    @UploadedFile() photo: Express.Multer.File | undefined,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.incidentService.create(req.user.cite_id!, req.user.sub, dto, photo);
  }

  @Get()
  @RequireFeature('INCIDENT_READ')
  @ApiOperation({ summary: 'Lister les incidents de ma cité' })
  @ApiResponse({ status: 200, description: 'Liste des incidents' })
  findAll(@Request() req: AuthenticatedRequest) {
    return this.incidentService.findAll(req.user.cite_id!, req.user.sub);
  }

  @Get('get-by-criteria')
  @RequireFeature('INCIDENT_READ')
  @ApiOperation({
    summary: 'Incidents de ma cité — DSL critères paginé',
    description:
      'DSL critères : <champ>.<op>=..., sort=(-)champ, fields=..., include=..., page, size, logic=and|or.',
  })
  async getByCriteria(
    @Query() query: Record<string, string>,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.criteria.paginate('incident', query, {
      cite_id: req.user.cite_id,
      is_deleted: false,
    });
  }

  @Get('categories')
  @ApiOperation({ summary: 'Catégories d\'incident (référentiel)' })
  @ApiResponse({ status: 200, description: 'Liste des catégories' })
  getCategories() {
    return this.incidentService.getCategories();
  }

  @Get('statuts')
  @ApiOperation({ summary: "Statuts d'incident (référentiel)" })
  @ApiResponse({ status: 200, description: 'Liste des statuts' })
  getStatuts() {
    return this.incidentService.getStatuts();
  }

  @Patch(':id/prise-en-charge')
  @RequireFeature('INCIDENT_MANAGE')
  @ApiOperation({ summary: "Prendre en charge un incident (statut En cours)" })
  @ApiResponse({ status: 200, description: 'Incident pris en charge' })
  prendreEnCharge(
    @Param('id') id: string,
    @Body() dto: PrendreEnChargeIncidentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.incidentService.prendreEnCharge(id, req.user.cite_id!, req.user.sub, dto);
  }

  @Patch(':id/resoudre')
  @RequireFeature('INCIDENT_MANAGE')
  @ApiOperation({ summary: "Résoudre un incident (statut Résolu)" })
  @ApiResponse({ status: 200, description: 'Incident résolu' })
  resoudre(
    @Param('id') id: string,
    @Body() dto: ResoudreIncidentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.incidentService.resoudre(id, req.user.cite_id!, req.user.sub, dto);
  }

  @Patch(':id/note')
  @RequireFeature('INCIDENT_MANAGE')
  @ApiOperation({ summary: "Ajouter une note syndic sur un incident" })
  @ApiResponse({ status: 200, description: 'Note enregistrée' })
  noteSyndic(
    @Param('id') id: string,
    @Body() dto: NoteSyndicIncidentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.incidentService.noteSyndic(id, req.user.cite_id!, req.user.sub, dto);
  }

  @Get(':id')
  @RequireFeature('INCIDENT_READ')
  @ApiOperation({ summary: "Détail d'un incident (likes + commentaires)" })
  @ApiResponse({ status: 200, description: 'Détail' })
  @ApiResponse({ status: 404, description: 'Incident introuvable' })
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.incidentService.findOne(id, req.user.cite_id!, req.user.sub);
  }

  @Post(':id/like')
  @RequireFeature('INCIDENT_LIKE')
  @ApiOperation({ summary: 'Liker / unliker un incident' })
  @ApiResponse({ status: 201, description: 'Like togglé' })
  toggleLike(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.incidentService.toggleLike(id, req.user.cite_id!, req.user.sub);
  }

  @Delete(':id/like')
  @RequireFeature('INCIDENT_LIKE')
  @ApiOperation({ summary: 'Unliker un incident' })
  @ApiResponse({ status: 200, description: 'Unlike' })
  unlike(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.incidentService.toggleLike(id, req.user.cite_id!, req.user.sub);
  }

  @Post(':id/commentaires')
  @RequireFeature('INCIDENT_COMMENT')
  @ApiOperation({ summary: 'Commenter un incident' })
  @ApiResponse({ status: 201, description: 'Commentaire créé' })
  addCommentaire(
    @Param('id') id: string,
    @Body() dto: CommentaireDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.incidentService.addCommentaire(id, req.user.cite_id!, req.user.sub, dto);
  }

  @Post(':id/commentaires/:commentId/repondre')
  @RequireFeature('INCIDENT_COMMENT')
  @ApiOperation({ summary: 'Répondre à un commentaire (niveau 2)' })
  @ApiResponse({ status: 201, description: 'Réponse créée' })
  @ApiResponse({ status: 400, description: 'Profondeur max 2 atteinte' })
  repondre(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() dto: CommentaireDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.incidentService.repondre(
      id,
      commentId,
      req.user.cite_id!,
      req.user.sub,
      dto,
    );
  }
}