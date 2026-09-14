import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { ProfilFeatureService } from './profil-feature.service';
import { UpdateProfilFeaturesDto } from './dto/update-profil-features.dto';

@ApiTags('Profils & Features')
@Controller('profils')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class ProfilFeatureController {
  constructor(private readonly service: ProfilFeatureService) {}

  // Liste des profils avec leurs features actives (groupées par module).
  @Get('features')
  @RequireFeature('ADMIN_MANAGE_FEATURES')
  @ApiOperation({ summary: 'Profils + features actives (super admin)' })
  @ApiResponse({ status: 200, description: 'Profils et features' })
  async list(@Req() req: AuthenticatedRequest) {
    const { user } = req;
    if (user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Réservé au super admin');
    }
    return this.service.listProfilsFeatures();
  }

  // Réécrit l'ensemble des features d'un profil (cocher / décocher).
  @Put(':id/features')
  @RequireFeature('ADMIN_MANAGE_FEATURES')
  @ApiOperation({
    summary: 'Remplacer les features d un profil',
    description:
      'body : { features: string[] }. Les codes absents sont retirés, les présents ajoutés. La version bump invalide les sessions.',
  })
  @ApiResponse({ status: 200, description: 'Features mises à jour' })
  async update(
    @Param('id', ParseIntPipe) profilId: number,
    @Body() body: UpdateProfilFeaturesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Réservé au super admin');
    }
    return this.service.setProfilFeatures(profilId, body.features ?? []);
  }
}