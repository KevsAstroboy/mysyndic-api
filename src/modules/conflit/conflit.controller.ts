import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Request,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { VillaOccupancyGuard } from '../../common/guards/villa-occupancy.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { CriteriaService } from '../../common/criteria/criteria.service';
import { ConflitService } from './conflit.service';
import { CreateConflitDto } from './dto/create-conflit.dto';
import {
  PrendreEnChargeDto,
  ResoudreConflitDto,
  NoteSyndicDto,
} from './dto/update-conflit.dto';

@ApiTags('Conflits')
@Controller('conflits')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class ConflitController {
  constructor(
    private readonly conflitService: ConflitService,
    private readonly criteria: CriteriaService,
  ) {}

  @Get('get-by-criteria')
  @RequireFeature('CONFLIT_READ_ALL')
  @ApiOperation({
    summary: 'Conflits de ma cité — DSL critères paginé',
    description:
      'DSL critères : <champ>.<op>=..., sort=(-)champ, fields=..., include=..., page, size, logic=and|or.',
  })
  async getByCriteria(
    @Query() query: Record<string, string>,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.criteria.paginate('conflit', query, {
      cite_id: req.user.cite_id,
      is_deleted: false,
    });
  }

  @Get('categories')
  @ApiOperation({ summary: 'Catégories de conflit (référentiel)' })
  @ApiResponse({ status: 200, description: 'Liste des catégories' })
  getCategories() {
    return this.conflitService.getCategories();
  }

  @Get('statuts')
  @ApiOperation({ summary: 'Statuts de conflit (référentiel)' })
  @ApiResponse({ status: 200, description: 'Liste des statuts' })
  getStatuts() {
    return this.conflitService.getStatuts();
  }

  @Post()
  @RequireFeature('CONFLIT_CREATE')
  @UseGuards(VillaOccupancyGuard)
  @ApiOperation({ summary: 'Déclarer un conflit' })
  @ApiResponse({ status: 201, description: 'Conflit déclaré' })
  create(@Body() dto: CreateConflitDto, @Request() req: AuthenticatedRequest) {
    return this.conflitService.create(req.user.cite_id!, req.user.sub, dto);
  }

  @Get('mes-conflits')
  @RequireFeature('CONFLIT_READ_OWN')
  @ApiOperation({ summary: 'Mes conflits déclarés' })
  @ApiResponse({ status: 200, description: 'Liste des conflits du déclarant' })
  findMine(@Request() req: AuthenticatedRequest) {
    return this.conflitService.findMine(req.user.cite_id!, req.user.sub);
  }

  @Get()
  @RequireFeature('CONFLIT_READ_ALL')
  @ApiOperation({ summary: 'Tous les conflits de la cité' })
  @ApiResponse({ status: 200, description: 'Liste des conflits' })
  findAll(@Request() req: AuthenticatedRequest) {
    return this.conflitService.findAll(req.user.cite_id!);
  }

  @Patch(':id/prise-en-charge')
  @RequireFeature('CONFLIT_MANAGE')
  @ApiOperation({ summary: 'Prendre en charge un conflit' })
  @ApiResponse({ status: 200, description: 'Conflit pris en charge' })
  @ApiResponse({ status: 409, description: 'Déjà pris en charge' })
  prendreEnCharge(
    @Param('id') id: string,
    @Body() dto: PrendreEnChargeDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.conflitService.prendreEnCharge(id, req.user.cite_id!, req.user.sub, dto);
  }

  @Patch(':id/resoudre')
  @RequireFeature('CONFLIT_MANAGE')
  @ApiOperation({ summary: 'Résoudre un conflit' })
  @ApiResponse({ status: 200, description: 'Conflit résolu' })
  resoudre(
    @Param('id') id: string,
    @Body() dto: ResoudreConflitDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.conflitService.resoudre(id, req.user.cite_id!, req.user.sub, dto);
  }

  @Patch(':id/note')
  @RequireFeature('CONFLIT_MANAGE')
  @ApiOperation({ summary: "Poser une note syndic sans résolution" })
  @ApiResponse({ status: 200, description: 'Note enregistrée' })
  noteSyndic(
    @Param('id') id: string,
    @Body() dto: NoteSyndicDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.conflitService.noteSyndic(id, req.user.cite_id!, req.user.sub, dto);
  }
}