import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CiteService } from './cite.service';
import { VillaService } from '../villa/villa.service';
import { CreateCiteDto, UpdateCiteDto } from './dto/cite.dto';
import { CreateVillaDto } from '../villa/dto/villa.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';

@ApiTags('Cités')
@Controller('cites')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class CiteController {
  constructor(
    private readonly citeService: CiteService,
    private readonly villaService: VillaService,
  ) {}

  @Get()
  @RequireFeature('SA_READ_ALL_CITES')
  @ApiOperation({ summary: 'Lister toutes les cités (Super Admin)' })
  @ApiResponse({ status: 200, description: 'Liste avec stats' })
  findAll(
    @Query('mois') mois?: string,
    @Query('debut') debut?: string,
    @Query('fin') fin?: string,
  ) {
    return this.citeService.findAll({ mois, debut, fin });
  }

  @Get(':id')
  @RequireFeature('SA_READ_ALL_CITES')
  @ApiOperation({ summary: 'Détail d une cité' })
  @ApiResponse({ status: 200, description: 'Cité' })
  @ApiResponse({ status: 404, description: 'Cité introuvable' })
  findOne(@Param('id') id: string) {
    return this.citeService.findOne(id);
  }

  @Post(':id/villas')
  @RequireFeature('SA_READ_ALL_CITES')
  @ApiOperation({ summary: 'Ajouter une villa à une cité (Super Admin)' })
  @ApiBody({ type: CreateVillaDto })
  @ApiResponse({ status: 201, description: 'Villa créée' })
  @ApiResponse({ status: 409, description: 'Numéro déjà existant' })
  createVilla(@Param('id') id: string, @Body() dto: CreateVillaDto) {
    return this.villaService.create(id, dto);
  }

  @Post()
  @RequireFeature('SA_CREATE_CITE')
  @ApiOperation({
    summary: 'Créer une cité',
    description: 'Transaction atomique : cite + groupe_cite + configuration + audit.',
  })
  @ApiBody({ type: CreateCiteDto })
  @ApiResponse({ status: 201, description: 'Cité créée' })
  @ApiResponse({ status: 409, description: 'Nom déjà utilisé' })
  @ApiResponse({ status: 403, description: 'Permission refusée' })
  create(@Body() dto: CreateCiteDto) {
    return this.citeService.create(dto);
  }

  @Patch(':id')
  @RequireFeature('SA_READ_ALL_CITES')
  @ApiOperation({ summary: 'Mettre à jour une cité' })
  @ApiBody({ type: UpdateCiteDto })
  @ApiResponse({ status: 200, description: 'Cité mise à jour' })
  @ApiResponse({ status: 404, description: 'Cité introuvable' })
  update(@Param('id') id: string, @Body() dto: UpdateCiteDto) {
    return this.citeService.update(id, dto);
  }
}