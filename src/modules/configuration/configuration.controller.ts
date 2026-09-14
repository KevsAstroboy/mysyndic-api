import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Request,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ConfigurationService } from './configuration.service';
import { CreateSubaccountDto, UpdateConfigurationDto } from './dto/configuration.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';

@ApiTags('Configuration')
@Controller('configuration')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class ConfigurationController {
  constructor(private readonly configurationService: ConfigurationService) {}

  @Get()
  @ApiOperation({ summary: 'Configuration de ma cité (clés secrètes masquées)' })
  @ApiResponse({ status: 200, description: 'Configuration' })
  get(@Request() req: AuthenticatedRequest) {
    return this.configurationService.findByCiteId(req.user.cite_id!);
  }

  @Patch()
  @RequireFeature('ADMIN_CONFIG_CITE')
  @ApiOperation({ summary: 'Mettre à jour la configuration de la cité' })
  @ApiBody({ type: UpdateConfigurationDto })
  @ApiResponse({ status: 200, description: 'Configuration mise à jour' })
  @ApiResponse({ status: 403, description: 'Feature ADMIN_CONFIG_CITE requise' })
  @ApiResponse({ status: 400, description: 'Split hors bornes ou subaccount manquant' })
  update(@Body() dto: UpdateConfigurationDto, @Request() req: AuthenticatedRequest) {
    return this.configurationService.update(req.user.cite_id!, dto, req.user.sub);
  }

  // Le syndic / admin ne voient jamais Paystack côté interface ; ce geste est
  // réservé au super admin, qui crée le sous-compte et le persiste en SPLIT.
  @Post('paystack/subaccount')
  @RequireFeature('ADMIN_CONFIG_CITE')
  @ApiOperation({
    summary: 'Créer le subaccount Paystack de la cité (super admin uniquement)',
    description:
      'Appelle l API Paystack /subaccount, puis enregistre le code retourné dans la configuration (mode SPLIT).',
  })
  @ApiBody({ type: CreateSubaccountDto })
  @ApiResponse({ status: 201, description: 'Subaccount créé + code masqué persisté' })
  @ApiResponse({ status: 403, description: 'Réservé au super admin' })
  createPaystackSubaccount(
    @Body() dto: CreateSubaccountDto,
    @Request() req: AuthenticatedRequest,
  ) {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Réservé au super admin');
    }
    return this.configurationService.createPaystackSubaccount(
      req.user.cite_id!,
      dto,
      req.user.sub,
    );
  }
}