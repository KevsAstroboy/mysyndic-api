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
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateProfileDto, CreateStaffDto, CreateAdminDto, AssignProfilsDto } from './dto/user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { CriteriaService } from '../../common/criteria/criteria.service';
import { StorageService } from '../../storage/storage.service';
import { UploadService } from '../../common/services/upload.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly criteria: CriteriaService,
    private readonly storage: StorageService,
    private readonly upload: UploadService,
  ) {}

  @Get('users/me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Profil de l user connecté avec villa courante + cité' })
  @ApiResponse({ status: 200, description: 'Profil' })
  me(@Request() req: AuthenticatedRequest) {
    return this.userService.getMe(req.user.sub, req.user.cite_id ?? null);
  }

  // Photo de profil : téléversement (multipart) — tout utilisateur connecté.
  @Patch('users/me/photo')
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Mettre à jour ma photo de profil (champ « photo »)' })
  @ApiResponse({ status: 200, description: 'photo_file_path + photo_url' })
  @ApiResponse({ status: 400, description: 'Fichier invalide' })
  @UseInterceptors(FileInterceptor('photo'))
  async uploadPhoto(
    @UploadedFile() photo: Express.Multer.File | undefined,
    @Request() req: AuthenticatedRequest,
  ) {
    const filePath = await this.userService.setProfilePhoto(req.user.sub, photo);
    return { photo_file_path: filePath, photo_url: `/api/users/me/photo` };
  }

  // Photo de profil : stream de l'image (pour les <img> partout).
  @Get('users/me/photo')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Ma photo de profil (image)' })
  @ApiResponse({ status: 200, description: 'Image' })
  @ApiResponse({ status: 404, description: 'Aucune photo' })
  async photo(@Request() req: AuthenticatedRequest, @Res() res: Response) {
    const path = await this.userService.getPhotoPath(req.user.sub);
    if (!path) throw new NotFoundException('Aucune photo de profil');
    const bucket = await this.upload.bucket();
    const object = await this.storage.getObjectStream(bucket, path);
    res.set({
      'Content-Type': object.contentType ?? 'image/jpeg',
      'Content-Length': String(object.size ?? 0),
      // Pas de cache long : la photo change souvent, on évite l'ancienne image.
      'Cache-Control': 'no-store',
    });
    object.stream.pipe(res);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequireFeature('HABITANT_READ')
  @ApiOperation({ summary: 'Lister les users de ma cité' })
  @ApiResponse({ status: 200, description: 'Liste' })
  findAll(@Request() req: AuthenticatedRequest) {
    return this.userService.findAll(req.user.cite_id!);
  }

  @Get('users/get-by-criteria')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequireFeature('HABITANT_READ')
  @ApiOperation({
    summary: 'Users de ma cité — DSL critères paginé',
    description:
      'DSL critères : <champ>.<op>=..., sort=(-)champ, fields=..., include=..., page, size, logic=and|or.',
  })
  async getByCriteria(
    @Query() query: Record<string, string>,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.user.cite_id) throw new ForbiddenException('Cité requise');
    return this.criteria.paginate('user', query, {
      cite_id: req.user.cite_id,
      is_deleted: false,
    });
  }

  @Get('users/:id')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequireFeature('HABITANT_READ')
  @ApiOperation({ summary: 'Détail d un user de la cité' })
  @ApiResponse({ status: 200, description: 'User' })
  @ApiResponse({ status: 404, description: 'Introuvable' })
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.userService.findOne(id, req.user.cite_id!);
  }

  @Patch('users/me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mettre à jour ses infos non sensibles' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Profil mis à jour' })
  @ApiResponse({ status: 409, description: 'Téléphone déjà utilisé' })
  updateProfile(@Request() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(req.user.sub, dto);
  }

  @Post('users/staff')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequireFeature('ADMIN_CREATE_STAFF')
  @ApiOperation({
    summary: 'Créer un staff (SYNDIC / CHEF_SECURITE)',
    description: 'Génère un mdp temporaire, envoie un email, must_change_password=TRUE.',
  })
  @ApiBody({ type: CreateStaffDto })
  @ApiResponse({ status: 201, description: 'Staff créé' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  createStaff(@Body() dto: CreateStaffDto, @Request() req: AuthenticatedRequest) {
    // Le super admin fournit la cité cible (bootstrap du premier syndic) ;
    // sinon le staff n'agit que dans sa propre cité.
    const citeId =
      req.user.role === 'SUPER_ADMIN' && dto.cite_id
        ? dto.cite_id
        : req.user.cite_id!;
    return this.userService.createStaff(citeId, dto, req.user);
  }

  @Post('users/admin')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequireFeature('SA_CREATE_ADMIN')
  @ApiOperation({
    summary: 'Créer un administrateur de cité (Super Admin)',
    description:
      'Crée un compte ADMIN rattaché à une cité (mdp temporaire + email, must_change_password=TRUE), l ajoute au groupe de la cité.',
  })
  @ApiBody({ type: CreateAdminDto })
  @ApiResponse({ status: 201, description: 'Admin créé' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  createAdmin(@Body() dto: CreateAdminDto, @Request() req: AuthenticatedRequest) {
    return this.userService.createAdmin(dto, req.user);
  }

  @Post('users/:id/profils')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequireFeature('SA_ASSIGN_PROFIL')
  @ApiOperation({
    summary: 'Assigner plusieurs profils à un user (Super Admin)',
    description:
      'Crée ou réactive les user_profil demandés (SUPER_ADMIN global sans cité, sinon cité requise). Invalide la session du user ciblé.',
  })
  @ApiBody({ type: AssignProfilsDto })
  @ApiResponse({ status: 201, description: 'Profils à jour du user' })
  assignProfils(
    @Param('id') id: string,
    @Body() dto: AssignProfilsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.userService.assignProfils(id, dto, req.user);
  }

  @Delete('users/:id/profils/:userProfilId')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequireFeature('SA_ASSIGN_PROFIL')
  @ApiOperation({
    summary: 'Retirer un profil à un user (Super Admin)',
    description: 'Soft-delete + désactivation. Refuse si c est le dernier profil actif.',
  })
  @ApiResponse({ status: 200, description: 'Profils à jour du user' })
  @ApiResponse({ status: 400, description: 'Dernier profil actif' })
  removeProfil(
    @Param('id') id: string,
    @Param('userProfilId') userProfilId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.userService.removeProfil(id, userProfilId, req.user);
  }

  @Patch('users/:id/activate')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequireFeature('ADMIN_DEACTIVATE_USER')
  @ApiOperation({ summary: 'Activer un compte' })
  @ApiResponse({ status: 200, description: 'Activé' })
  activate(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.userService.toggleActive(id, req.user.cite_id!, true, req.user);
  }

  @Patch('users/:id/deactivate')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequireFeature('ADMIN_DEACTIVATE_USER')
  @ApiOperation({ summary: 'Désactiver un compte + invalidation session' })
  @ApiResponse({ status: 200, description: 'Désactivé' })
  deactivate(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.userService.toggleActive(id, req.user.cite_id!, false, req.user);
  }
}