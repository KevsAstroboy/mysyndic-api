import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
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
import { UserService } from '../user/user.service';
import { ConfigurationService } from '../configuration/configuration.service';
import { CreateCiteDto, UpdateCiteDto } from './dto/cite.dto';
import { CreateVillaDto, UpdateVillaDto } from '../villa/dto/villa.dto';
import {
  CreateSubaccountDto,
  UpdateConfigurationDto,
} from '../configuration/dto/configuration.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';

@ApiTags('Cités')
@Controller('cites')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class CiteController {
  constructor(
    private readonly citeService: CiteService,
    private readonly villaService: VillaService,
    private readonly userService: UserService,
    private readonly configurationService: ConfigurationService,
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

  // ── Gestion super admin d'une cité : villas ─────────────────
  @Get(':id/villas')
  @RequireFeature('SA_READ_ALL_CITES')
  @ApiOperation({ summary: 'Villas d une cité + statut d occupation (Super Admin)' })
  @ApiResponse({ status: 200, description: 'Villas avec statut libre/occupee' })
  villas(@Param('id') id: string) {
    return this.villaService.listCitesVillas(id);
  }

  @Patch(':id/villas/:villaId')
  @RequireFeature('SA_READ_ALL_CITES')
  @ApiOperation({ summary: 'Mettre à jour une villa d une cité (Super Admin)' })
  @ApiBody({ type: UpdateVillaDto })
  @ApiResponse({ status: 200, description: 'Villa mise à jour' })
  updateVilla(
    @Param('id') id: string,
    @Param('villaId') villaId: string,
    @Body() dto: UpdateVillaDto,
  ) {
    return this.villaService.update(villaId, id, dto);
  }

  @Delete(':id/villas/:villaId')
  @RequireFeature('SA_READ_ALL_CITES')
  @ApiOperation({ summary: 'Supprimer une villa d une cité (Super Admin)' })
  @ApiResponse({ status: 200, description: 'Villa supprimée' })
  removeVilla(
    @Param('id') id: string,
    @Param('villaId') villaId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.villaService.remove(villaId, id, req.user.sub);
  }

  // ── Gestion super admin d'une cité : comptes ────────────────
  @Get(':id/users')
  @RequireFeature('SA_READ_ALL_CITES')
  @ApiOperation({
    summary: 'Comptes d une cité (Super Admin)',
    description: 'Optional ?profil=SYNDIC pour filtrer par code de rôle.',
  })
  @ApiResponse({ status: 200, description: 'Liste des comptes' })
  users(@Param('id') id: string, @Query('profil') profil?: string) {
    return this.userService.findAll(id, profil);
  }

  @Patch(':id/users/:userId/activate')
  @RequireFeature('SA_READ_ALL_CITES')
  @ApiOperation({ summary: 'Activer un compte de la cité (Super Admin)' })
  activateUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.userService.toggleActive(userId, id, true, req.user);
  }

  @Patch(':id/users/:userId/deactivate')
  @RequireFeature('SA_READ_ALL_CITES')
  @ApiOperation({ summary: 'Désactiver un compte de la cité (Super Admin)' })
  deactivateUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.userService.toggleActive(userId, id, false, req.user);
  }

  // ── Gestion super admin d'une cité : configuration ──────────
  @Get(':id/configuration')
  @RequireFeature('SA_READ_ALL_CITES')
  @ApiOperation({ summary: 'Configuration d une cité (Super Admin, clés masquées)' })
  configuration(@Param('id') id: string) {
    return this.configurationService.findByCiteId(id);
  }

  @Patch(':id/configuration')
  @RequireFeature('SA_READ_ALL_CITES')
  @ApiOperation({ summary: 'Mettre à jour la configuration d une cité (Super Admin)' })
  @ApiBody({ type: UpdateConfigurationDto })
  @ApiResponse({ status: 200, description: 'Configuration mise à jour' })
  updateConfiguration(
    @Param('id') id: string,
    @Body() dto: UpdateConfigurationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.configurationService.update(id, dto, req.user.sub);
  }

  // Crée le sous-compte Paystack de la cité (code + mode persistés). La
  // commission et le mode SPLIT restent mutuellement exclusifs.
  @Post(':id/paystack/subaccount')
  @RequireFeature('SA_READ_ALL_CITES')
  @ApiOperation({
    summary: 'Créer le sous-compte Paystack de la cité (Super Admin)',
    description:
      'Appelle Paystack, puis persiste code + mode (commission ou split) dans la configuration de la cité.',
  })
  @ApiBody({ type: CreateSubaccountDto })
  @ApiResponse({ status: 201, description: 'Sous-compte créé' })
  createPaystackSubaccount(
    @Param('id') id: string,
    @Body() dto: CreateSubaccountDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.configurationService.createPaystackSubaccountForCite(
      id,
      dto,
      req.user.sub,
    );
  }
}