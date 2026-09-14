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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { CriteriaService } from '../../common/criteria/criteria.service';
import { AnnonceService } from './annonce.service';
import { CreateAnnonceDto } from './dto/create-annonce.dto';
import { UpdateAnnonceDto } from './dto/update-annonce.dto';

@ApiTags('Annonces')
@Controller('annonces')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class AnnonceController {
  constructor(
    private readonly annonceService: AnnonceService,
    private readonly criteria: CriteriaService,
  ) {}

  @Get('get-by-criteria')
  @RequireFeature('ANNONCE_READ')
  @ApiOperation({
    summary: 'Annonces de ma cité — DSL critères paginé',
    description:
      'DSL critères : <champ>.<op>=..., sort=(-)champ, fields=..., include=..., page, size, logic=and|or.',
  })
  async getByCriteria(
    @Query() query: Record<string, string>,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.criteria.paginate('annonce', query, {
      cite_id: req.user.cite_id,
      is_deleted: false,
    });
  }

  @Get()
  @RequireFeature('ANNONCE_READ')
  @ApiOperation({ summary: 'Lister les annonces de ma cité' })
  @ApiResponse({ status: 200, description: 'Liste des annonces' })
  findAll(@Request() req: AuthenticatedRequest) {
    return this.annonceService.findAll(req.user.cite_id!);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Catégories d\'annonce (référentiel)' })
  @ApiResponse({ status: 200, description: 'Liste des catégories' })
  getCategories() {
    return this.annonceService.getCategories();
  }

  @Get(':id')
  @RequireFeature('ANNONCE_READ')
  @ApiOperation({ summary: "Détail d'une annonce" })
  @ApiResponse({ status: 200, description: 'Détail' })
  @ApiResponse({ status: 404, description: 'Annonce introuvable' })
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.annonceService.findOne(id, req.user.cite_id!);
  }

  @Post()
  @RequireFeature('ANNONCE_CREATE')
  @ApiOperation({ summary: 'Créer une annonce' })
  @ApiResponse({ status: 201, description: 'Annonce créée' })
  create(@Body() dto: CreateAnnonceDto, @Request() req: AuthenticatedRequest) {
    return this.annonceService.create(req.user.cite_id!, req.user.sub, dto);
  }

  @Patch(':id')
  @RequireFeature('ANNONCE_UPDATE')
  @ApiOperation({ summary: "Modifier une annonce" })
  @ApiResponse({ status: 200, description: 'Annonce modifiée' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAnnonceDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.annonceService.update(id, req.user.cite_id!, req.user.sub, dto);
  }

  @Delete(':id')
  @RequireFeature('ANNONCE_DELETE')
  @ApiOperation({ summary: "Supprimer une annonce" })
  @ApiResponse({ status: 200, description: 'Annonce supprimée' })
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.annonceService.remove(id, req.user.cite_id!, req.user.sub);
  }
}