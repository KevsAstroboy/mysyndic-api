import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  ActivateAccountDto,
  ResendActivationOtpDto,
} from './dto/activate-account.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { SwitchContextDto } from './dto/switch-context.dto';
import { Public } from '../../common/guards/must-change-password.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @ApiOperation({
    summary: 'Inscription habitant',
    description:
      "Crée un user + sa villa courante, l ajoute au groupe de la cité, crée le profil HABITANT, journalise en audit, puis envoie un code OTP d'activation. Le compte reste is_active=false tant que /auth/activate n'a pas validé le code.",
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'Compte créé — activation requise',
    schema: {
      example: {
        user_id: 'uuuu',
        email: 'habitant@example.com',
        requires_activation: true,
        occupation_en_attente: true,
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  @ApiResponse({ status: 400, description: 'Villa introuvable ou données invalides' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('activate')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activer son compte',
    description:
      "Valide l'OTP d'activation reçu par email, active le compte (is_active=true) puis retourne les tokens (réponse auth complète).",
  })
  @ApiBody({ type: ActivateAccountDto })
  @ApiResponse({ status: 200, description: 'Compte activé + tokens', type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Code invalide / expiré / trop de tentatives' })
  async activate(@Body() dto: ActivateAccountDto) {
    return this.authService.activate(dto);
  }

  @Post('activate/resend')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Renvoi de l'OTP d'activation",
    description:
      "Renvoie un nouveau code d'activation si le compte existe et n'est pas encore activé. Anti-enumeration : réponse générique si email inconnu. Anti-spam : 1 minute minimum entre deux envois.",
  })
  @ApiBody({ type: ResendActivationOtpDto })
  @ApiResponse({ status: 200, description: 'Code renvoyé (si applicable)', schema: { example: { message: 'Si cet email est associé à un compte, un code a été envoyé.' } } })
  @ApiResponse({ status: 400, description: 'Compte déjà activé / veuillez patienter' })
  async resendActivationOtp(@Body() dto: ResendActivationOtpDto) {
    return this.authService.resendActivationOtp(dto.email);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion', description: 'Authentifie par email/téléphone + mdp, charge RBAC dans Redis.' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Connexion réussie', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Identifiants invalides ou compte désactivé' })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Get('profils')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Profils sélectionnables de l utilisateur connecté',
    description:
      'Renvoie chaque user_profil actif avec sa cité. Permet à l UI d afficher un sélecteur quand l utilisateur a plusieurs profils (plusieurs cités possibles).',
  })
  @ApiResponse({ status: 200, description: 'Profils + profil actif' })
  listProfils(@Request() req: AuthenticatedRequest) {
    return this.authService.listProfils(req.user.sub);
  }

  @Post('context')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Choisir / switcher de profil actif',
    description:
      'Reconstruit la session (rôle, cité, features) pour le user_profil choisi et renvoie de nouveaux tokens.',
  })
  @ApiBody({ type: SwitchContextDto })
  @ApiResponse({ status: 200, description: 'Tokens pour le contexte choisi', type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Profil introuvable ou inactif' })
  async switchContext(@Body() dto: SwitchContextDto, @Request() req: AuthenticatedRequest) {
    return this.authService.switchContext(req.user.sub, dto.user_profil_id);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renouveler le token' })
  @ApiBody({ schema: { example: { refresh_token: 'eyJhbG...' } } })
  @ApiResponse({ status: 200, description: 'Nouveaux tokens', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token invalide' })
  async refresh(@Body('refresh_token') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Changer son mot de passe',
    description: 'Seul endpoint accessible quand must_change_password=true (R3).',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Mot de passe modifié' })
  @ApiResponse({ status: 400, description: 'Ancien mot de passe incorrect' })
  @ApiResponse({ status: 403, description: 'MUST_CHANGE_PASSWORD sur une autre route' })
  async changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.sub, dto);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mot de passe oublié',
    description: "Envoie un OTP si l'email existe. Réponse générique anti-enumeration.",
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'Code envoyé (si email existe)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réinitialiser le mot de passe' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Mot de passe réinitialisé' })
  @ApiResponse({ status: 400, description: 'Code invalide ou expiré' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Déconnexion', description: 'Invalide la session Redis et journalise LOGOUT.' })
  @ApiResponse({ status: 200, description: 'Déconnecté' })
  async logout(@Request() req: AuthenticatedRequest) {
    return this.authService.logout(req.user.sub);
  }
}