import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Request,
  Res,
  UseGuards,
  ForbiddenException,
  NotFoundException,
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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { VillaOccupancyGuard } from '../../common/guards/villa-occupancy.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { CriteriaService } from '../../common/criteria/criteria.service';
import { UploadService } from '../../common/services/upload.service';
import { StorageService } from '../../storage/storage.service';
import { AlerteService } from './alerte-securite.service';
import { CreateAlerteDto } from './dto/create-alerte.dto';
import { UpdateStatutAlerteDto, ResoudreAlerteDto } from './dto/update-alerte.dto';

@ApiTags('Alertes')
@Controller('alertes')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class AlerteController {
  constructor(
    private readonly alerteService: AlerteService,
    private readonly criteria: CriteriaService,
    private readonly storage: StorageService,
    private readonly upload: UploadService,
  ) {}

  @Get('get-by-criteria')
  @RequireFeature('ALERTE_READ_HISTORY')
  @ApiOperation({
    summary: 'Alertes de ma cité — DSL critères paginé',
    description:
      'DSL critères : <champ>.<op>=..., sort=(-)champ, fields=..., include=..., page, size, logic=and|or.',
  })
  async getByCriteria(
    @Query() query: Record<string, string>,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.criteria.paginate('alerte_securite', query, {
      cite_id: req.user.cite_id,
      is_deleted: false,
    });
  }

  @Get(':id/photo')
  @ApiOperation({ summary: 'Photo d une alerte (image)' })
  @ApiResponse({ status: 200, description: 'Image' })
  @ApiResponse({ status: 404, description: 'Aucune photo' })
  async photo(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const path = await this.alerteService.getPhotoPath(
      id,
      req.user.cite_id!,
      req.user.sub,
    );
    if (!path) throw new NotFoundException('Aucune photo pour cette alerte');
    const bucket = await this.upload.bucket();
    const object = await this.storage.getObjectStream(bucket, path);
    res.set({
      'Content-Type': object.contentType ?? 'image/jpeg',
      'Content-Length': String(object.size ?? 0),
      'Cache-Control': 'no-store',
    });
    object.stream.pipe(res);
  }

  @Post()
  @RequireFeature('ALERTE_CREATE')
  @UseGuards(VillaOccupancyGuard)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Envoyer une alerte sécurité',
    description: 'Champs texte + photo optionnelle (multipart, champ fichier « photo »).',
  })
  @ApiResponse({ status: 201, description: 'Alerte créée' })
  @UseInterceptors(FileInterceptor('photo'))
  create(
    @Body() dto: CreateAlerteDto,
    @UploadedFile() photo: Express.Multer.File | undefined,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.alerteService.create(req.user.cite_id!, req.user.sub, dto, photo);
  }

  @Get('actives')
  @RequireFeature('ALERTE_READ_ACTIVE')
  @ApiOperation({ summary: 'Alertes actives de la cité' })
  @ApiResponse({ status: 200, description: 'Liste des alertes actives' })
  findActives(@Request() req: AuthenticatedRequest) {
    return this.alerteService.findActives(req.user.cite_id!);
  }

  @Get('historique')
  @RequireFeature('ALERTE_READ_HISTORY')
  @ApiOperation({ summary: 'Historique des alertes de la cité' })
  @ApiResponse({ status: 200, description: 'Historique' })
  findHistorique(@Request() req: AuthenticatedRequest) {
    return this.alerteService.findHistorique(req.user.cite_id!);
  }

  @Get('mes-alertes')
  @ApiOperation({
    summary: 'Mes alertes signalées (suivi habitant)',
    description:
      "Accessible à tout profil connecté, sans feature de sécurité : renvoie les alertes DÉCLARÉES par l'utilisateur DANS LA CITÉ ACTIVE, avec statut actuel — pour suivre ses propres signalements. Paginé (page, size).",
  })
  @ApiResponse({ status: 200, description: 'Liste paginée de mes alertes' })
  mesAlertes(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.alerteService.mesAlertes(
      req.user.sub,
      req.user.cite_id ?? null,
      Number(page) || 1,
      Number(size) || 10,
    );
  }

  @Get('motifs')
  @ApiOperation({ summary: 'Motifs d\'alerte (référentiel)' })
  @ApiResponse({ status: 200, description: 'Liste des motifs' })
  getMotifs() {
    return this.alerteService.getMotifs();
  }

  @Get('statuts')
  @ApiOperation({ summary: 'Statuts d\'alerte (référentiel)' })
  @ApiResponse({ status: 200, description: 'Liste des statuts' })
  getStatuts() {
    return this.alerteService.getStatuts();
  }

  @Get(':id')
  @RequireFeature('ALERTE_READ_ACTIVE')
  @ApiOperation({ summary: "Détail d'une alerte" })
  @ApiResponse({ status: 200, description: 'Détail' })
  @ApiResponse({ status: 404, description: 'Alerte introuvable' })
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.alerteService.findOne(id, req.user.cite_id!);
  }

  @Patch(':id/statut')
  @RequireFeature('ALERTE_UPDATE_STATUT')
  @ApiOperation({ summary: "Changer le statut / escalader d'une alerte" })
  @ApiResponse({ status: 200, description: 'Alerte mise à jour' })
  updateStatut(
    @Param('id') id: string,
    @Body() dto: UpdateStatutAlerteDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.alerteService.updateStatut(id, req.user.cite_id!, req.user.sub, dto);
  }

  @Patch(':id/resoudre')
  @RequireFeature('ALERTE_UPDATE_STATUT')
  @ApiOperation({ summary: "Résoudre une alerte" })
  @ApiResponse({ status: 200, description: 'Alerte résolue' })
  resoudre(
    @Param('id') id: string,
    @Body() dto: ResoudreAlerteDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.alerteService.resoudre(id, req.user.cite_id!, req.user.sub, dto);
  }
}