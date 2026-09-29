import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { VillaService } from '../villa/villa.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { SessionCache, SessionOptions } from './session.interface';
import { JwtPayload } from '../../common/types/jwt-payload.interface';

const SESSION_PREFIX = 'session:';
const REFRESH_PREFIX = 'refresh:';
const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_DELAY_MINUTES = 1;
const OTP_MAX_ATTEMPTS = 5;
const OTP_CONTEXT_ACTIVATION = 'ACCOUNT_ACTIVATION';

function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    private readonly villaService: VillaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  // ── Inscription habitant ────────────────────────────────────
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }] },
    });
    if (existing && existing.is_deleted !== true) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    const villa = await this.prisma.villa.findFirst({
      where: { id: dto.villa_id, is_deleted: false },
    });
    if (!villa) {
      throw new BadRequestException({ code: 'VILLA_INTROUVABLE', message: 'Villa introuvable' });
    }

    await this.villaService.assertCandidatureOuverte(villa.id);

    const hashed = await bcrypt.hash(dto.password, 12);

    const userId = existing
      ? await this.reactivateAccount(existing.id, villa, dto, hashed)
      : await this.createHabitantAccount(villa, dto, hashed);

    await this.sendActivationOtp(userId, dto.email);

    this.logger.log(
      `Registered user ${userId} (${dto.email}) — activation requise${existing ? ' (compte réactivé)' : ''}`,
    );
    return {
      message:
        'Compte créé. Vérifiez votre email pour activer votre compte (code envoyé).',
      user_id: userId,
      email: dto.email,
      requires_activation: true,
      occupation_en_attente: true,
    };
  }

  private async createHabitantAccount(
    villa: { id: string; cite_id: string },
    dto: RegisterDto,
    hashed: string,
  ): Promise<string> {
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          cite_id: villa.cite_id,
          prenom: dto.prenom,
          nom: dto.nom,
          email: dto.email,
          telephone: dto.telephone,
          password_hash: hashed,
          must_change_password: false,
          is_active: false,
          created_at: new Date(),
        },
      });

      await tx.user_villa.create({
        data: {
          user_id: created.id,
          villa_id: villa.id,
          cite_id: villa.cite_id,
          is_current: true,
          is_confirme: false,
          assigned_at: new Date(),
          created_at: new Date(),
        },
      });

      await tx.user_profil.create({
        data: {
          user_id: created.id,
          profil_id: 5,
          cite_id: villa.cite_id,
          order_priority: 1,
          is_active: true,
          assigned_at: new Date(),
          created_at: new Date(),
        },
      });

      await this.addToCiteGroupe(tx, created.id, villa.cite_id);
      await this.auditUserCreate(tx, created.id, villa.cite_id);
      return created;
    });

    return user.id;
  }

  private async reactivateAccount(
    userId: string,
    villa: { id: string; cite_id: string },
    dto: RegisterDto,
    hashed: string,
  ): Promise<string> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          cite_id: villa.cite_id,
          prenom: dto.prenom,
          nom: dto.nom,
          email: dto.email,
          telephone: dto.telephone,
          password_hash: hashed,
          must_change_password: false,
          is_active: false,
          is_deleted: false,
          deleted_at: null,
          deleted_by: null,
          updated_at: new Date(),
        },
      });

      await tx.user_villa.updateMany({
        where: { user_id: userId, cite_id: villa.cite_id, is_current: true, is_deleted: false },
        data: { is_current: false, updated_at: new Date() },
      });

      await tx.user_villa.create({
        data: {
          user_id: userId,
          villa_id: villa.id,
          cite_id: villa.cite_id,
          is_current: true,
          is_confirme: false,
          assigned_at: new Date(),
          created_at: new Date(),
        },
      });

      // Priorité libre pour respecter idx_user_profil_default
      // (un seul profil actif order_priority=1 par user).
      const actifs = await tx.user_profil.findMany({
        where: { user_id: userId, is_active: true, is_deleted: false },
        select: { order_priority: true },
      });
      const aDejaP1 = actifs.some((p) => p.order_priority === 1);
      const maxP = actifs.reduce((m, p) => Math.max(m, p.order_priority), 0);
      const priorite = !aDejaP1 ? 1 : Math.min(maxP + 1, 10);

      await tx.user_profil.upsert({
        where: {
          user_id_profil_id_cite_id: {
            user_id: userId,
            profil_id: 5,
            cite_id: villa.cite_id,
          },
        },
        create: {
          user_id: userId,
          profil_id: 5,
          cite_id: villa.cite_id,
          order_priority: priorite,
          is_active: true,
          assigned_at: new Date(),
          created_at: new Date(),
        },
        update: {
          order_priority: priorite,
          is_active: true,
          is_deleted: false,
          revoked_at: null,
          revoked_by: null,
          deleted_at: null,
          deleted_by: null,
          assigned_at: new Date(),
          updated_at: new Date(),
        },
      });

      await this.addToCiteGroupe(tx, userId, villa.cite_id);
      await this.auditUserCreate(tx, userId, villa.cite_id);
    });

    this.logger.log(`Reactivated soft-deleted account ${userId}`);
    return userId;
  }

  private async addToCiteGroupe(
    tx: Prisma.TransactionClient,
    userId: string,
    citeId: string,
  ) {
    await tx.$executeRawUnsafe(
      'CALL add_user_to_cite_groupe($1::uuid, $2::uuid)',
      userId,
      citeId,
    );
  }

  private async auditUserCreate(
    tx: Prisma.TransactionClient,
    userId: string,
    citeId: string,
  ) {
    await tx.audit_log.create({
      data: {
        cite_id: citeId,
        user_id: userId,
        profil_actif_code: 'HABITANT',
        action: 'CREATE',
        entite: 'user',
        entite_id: userId,
        created_at: new Date(),
      },
    });
  }

  // ── Activation du compte (OTP email) ─────────────────────────
  async activate(dto: ActivateAccountDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, is_deleted: false },
    });
    if (!user) {
      throw new BadRequestException('Code invalide');
    }

    const otp = await this.prisma.otp.findFirst({
      where: {
        user_id: user.id,
        contexte: OTP_CONTEXT_ACTIVATION,
        email_dest: dto.email,
      },
      orderBy: { created_at: 'desc' },
    });

    if (!otp || otp.code !== dto.otp_code) {
      if (otp && !otp.is_used) {
        await this.prisma.otp.update({
          where: { id: otp.id },
          data: { attempts_count: { increment: 1 }, updated_at: new Date() },
        });
      }
      throw new BadRequestException('Code invalide');
    }

    if (user.is_active) {
      this.logger.log(`Account already active for user ${user.id} (${dto.email})`);
      return this.buildAuthResponse(user.id);
    }

    if (otp.is_used) {
      throw new BadRequestException('Code déjà utilisé. Redemandez un code.');
    }
    if (otp.attempts_count >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Trop de tentatives. Redemandez un code.');
    }
    if (new Date() > otp.expires_at) {
      throw new BadRequestException('Code expiré. Redemandez un code.');
    }

    await this.prisma.$transaction([
      this.prisma.otp.updateMany({
        where: { id: otp.id },
        data: { is_used: true, updated_at: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { is_active: true, updated_at: new Date() },
      }),
    ]);

    await this.auditAction(
      user.id,
      'UPDATE',
      'user',
      user.id,
      user.cite_id,
    );

    this.logger.log(`Account activated for user ${user.id} (${dto.email})`);
    return this.buildAuthResponse(user.id);
  }

  // ── Renvoi OTP d'activation ──────────────────────────────────
  async resendActivationOtp(email: string): Promise<unknown> {
    const user = await this.prisma.user.findFirst({
      where: { email, is_deleted: false },
    });
    if (!user) {
      return {
        message: 'Si cet email est associé à un compte, un code a été envoyé.',
      };
    }
    if (user.is_active) {
      throw new BadRequestException('Ce compte est déjà activé');
    }

    const existing = await this.prisma.otp.findFirst({
      where: {
        user_id: user.id,
        contexte: OTP_CONTEXT_ACTIVATION,
        is_used: false,
      },
      orderBy: { created_at: 'desc' },
    });
    if (existing && existing.created_at > new Date(Date.now() - OTP_RESEND_DELAY_MINUTES * 60 * 1000)) {
      throw new BadRequestException('Veuillez patienter avant de redemander un code');
    }

    await this.sendActivationOtp(user.id, email);
    this.logger.log(`Activation OTP resent to ${email}`);
    return {
      message:
        'Si cet email est associé à un compte, un code a été envoyé.',
    };
  }

  // ── Helpers OTP ──────────────────────────────────────────────
  private async sendActivationOtp(userId: string, email: string): Promise<string> {
    const code = generateOtpCode();
    await this.prisma.otp.create({
      data: {
        code,
        user_id: userId,
        contexte: OTP_CONTEXT_ACTIVATION,
        email_dest: email,
        expires_at: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
        created_at: new Date(),
      },
    });
    this.mailService.sendOtpEmail(email, code).catch((e) => {
      this.logger.error(`Failed to send activation OTP to ${email}: ${e.message}`);
    });
    return code;
  }

  // ── Connexion ───────────────────────────────────────────────
  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.identifier }, { telephone: dto.identifier }],
        is_deleted: false,
      },
    });

    if (!user || !user.password_hash) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Compte désactivé');
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    return this.buildAuthResponse(user.id);
  }

  // ── Changement de mot de passe ──────────────────────────────
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, is_deleted: false },
    });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    const valid = await bcrypt.compare(dto.old_password, user.password_hash ?? '');
    if (!valid) {
      throw new BadRequestException('Ancien mot de passe incorrect');
    }

    const hashed = await bcrypt.hash(dto.new_password, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: hashed,
        must_change_password: false,
        updated_at: new Date(),
      },
    });

    await this.redis.del(`${SESSION_PREFIX}${userId}`);
    const session = await this.refreshSession(userId);
    await this.auditAction(userId, 'UPDATE', 'user', userId, session.citeId);

    this.logger.log(`Password changed for user ${userId}`);
    return { message: 'Mot de passe modifié avec succès' };
  }

  // ── Mot de passe oublié ─────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, is_deleted: false },
    });

    if (!user) {
      return {
        message: 'Si cet email est associé à un compte, un code a été envoyé.',
      };
    }

    const otp = await this.prisma.otp.findFirst({
      where: { user_id: user.id, contexte: 'FORGOT_PASSWORD', is_used: false },
      orderBy: { created_at: 'desc' },
    });
    if (otp && otp.created_at > new Date(Date.now() - OTP_RESEND_DELAY_MINUTES * 60 * 1000)) {
      throw new BadRequestException('Veuillez patienter avant de redemander un code');
    }

    const code = generateOtpCode();
    await this.prisma.otp.create({
      data: {
        code,
        user_id: user.id,
        contexte: 'FORGOT_PASSWORD',
        email_dest: dto.email,
        expires_at: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
        created_at: new Date(),
      },
    });

    this.mailService.sendOtpEmail(dto.email, code).catch((e) => {
      this.logger.error(`Failed to send OTP email: ${e.message}`);
    });

    return {
      message: 'Si cet email est associé à un compte, un code a été envoyé.',
    };
  }

  // ── Réinitialisation ─────────────────────────────────────────
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, is_deleted: false },
    });
    if (!user) {
      throw new BadRequestException('Code invalide');
    }

    const otp = await this.prisma.otp.findFirst({
      where: {
        user_id: user.id,
        contexte: 'FORGOT_PASSWORD',
        is_used: false,
      },
      orderBy: { created_at: 'desc' },
    });

    if (!otp || otp.code !== dto.otp_code) {
      throw new BadRequestException('Code invalide');
    }
    if (new Date() > otp.expires_at) {
      throw new BadRequestException('Code expiré. Redemandez un code.');
    }

    const hashed = await bcrypt.hash(dto.new_password, 12);

    await this.prisma.$transaction([
      this.prisma.otp.updateMany({
        where: { id: otp.id },
        data: { is_used: true, updated_at: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          password_hash: hashed,
          must_change_password: false,
          updated_at: new Date(),
        },
      }),
    ]);

    await this.redis.del(`${SESSION_PREFIX}${user.id}`);
    await this.auditAction(user.id, 'UPDATE', 'user', user.id, user.cite_id);

    this.logger.log(`Password reset for user ${user.id}`);
    return { message: 'Mot de passe réinitialisé avec succès.' };
  }

  // ── Déconnexion ─────────────────────────────────────────────
  async logout(userId: string) {
    const session = await this.getSession(userId);
    await this.redis.del(`${SESSION_PREFIX}${userId}`);
    await this.redis.del(`${REFRESH_PREFIX}${userId}`);

    if (session) {
      await this.auditAction(userId, 'LOGOUT', 'auth', userId, session.citeId);
    }
    return { message: 'Déconnecté' };
  }

  // ── Choix / switch de profil ────────────────────────────────
  async listProfils(userId: string) {
    let session = await this.getSession(userId);
    if (!session) {
      session = await this.refreshSession(userId);
    }
    return {
      profil_actif_user_profil_id: session.userProfilId,
      profils: session.profils,
    };
  }

  async switchContext(userId: string, userProfilId: string) {
    const up = await this.prisma.user_profil.findFirst({
      where: {
        id: userProfilId,
        user_id: userId,
        is_deleted: false,
        is_active: true,
        OR: [{ cite_id: null }, { cite: { is_active: true } }],
      },
    });
    if (!up) {
      throw new BadRequestException('Profil introuvable ou inactif');
    }
    this.logger.log(`Switch context user ${userId} -> user_profil ${userProfilId}`);
    return this.buildAuthResponse(userId, { userProfilId });
  }

  // ── Refresh token ───────────────────────────────────────────
  async refreshToken(refreshToken: string): Promise<AuthResponseDto> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, is_deleted: false, is_active: true },
      });
      if (!user) {
        throw new UnauthorizedException('Token invalide');
      }
      const cached = await this.redis.get(`${REFRESH_PREFIX}${user.id}`);
      if (cached !== refreshToken) {
        throw new UnauthorizedException('Token invalide ou expiré');
      }
      return this.buildAuthResponse(user.id);
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }

  // ── Session Redis ───────────────────────────────────────────
  async getSession(userId: string): Promise<SessionCache | null> {
    const raw = await this.redis.get(`${SESSION_PREFIX}${userId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  async refreshSession(userId: string, opts?: SessionOptions): Promise<SessionCache> {
    const session = await this.computeSession(userId, opts);
    const ttl = parseInt(
      this.config.get('REDIS_SESSION_TTL_SECONDS') || '86400',
      10,
    );
    await this.redis.set(`${SESSION_PREFIX}${userId}`, JSON.stringify(session), 'EX', ttl);
    return session;
  }

  async isSessionStale(session: SessionCache): Promise<boolean> {
    const profilIds = Object.keys(session.profilVersions).map(Number);
    if (profilIds.length === 0) return false;

    const rows = await this.prisma.$queryRawUnsafe<{ profil_id: number; version_tag: string }[]>(
      `SELECT DISTINCT pf.profil_id, pf.version_tag
       FROM profil_feature pf
       WHERE pf.profil_id = ANY($1::int[])
         AND pf.is_deleted = FALSE
         AND pf.valid_from <= CURRENT_TIMESTAMP
         AND (pf.valid_until IS NULL OR pf.valid_until > CURRENT_TIMESTAMP)`,
      profilIds,
    );

    const current = new Map<number, string>();
    for (const r of rows) {
      current.set(Number(r.profil_id), r.version_tag);
    }

    for (const pid of profilIds) {
      const cached = session.profilVersions[pid];
      const live = current.get(pid);
      if (cached && live && cached !== live) return true;
    }
    return false;
  }

  private async computeSession(userId: string, opts?: SessionOptions): Promise<SessionCache> {
    const userProfils = await this.prisma.user_profil.findMany({
      where: {
        user_id: userId,
        is_deleted: false,
        is_active: true,
        // Profils rattachés à une cité DÉSACTIVÉE → exclus. Les profils
        // globaux (cite_id null : super-admin/admin) sont conservés : sinon
        // désactiver une cité couperait un compte multi-cités / global.
        OR: [{ cite_id: null }, { cite: { is_active: true } }],
      },
      orderBy: { order_priority: 'asc' },
      include: {
        profil: { select: { id: true, libelle: true, code: true } },
        cite: { select: { id: true, nom: true } },
      },
    });

    const profils: SessionCache['profils'] = userProfils.map((up) => ({
      userProfilId: up.id,
      profilId: up.profil_id,
      libelle: up.profil?.libelle ?? '',
      code: up.profil?.code ?? '',
      citeId: up.cite_id,
      citeNom: up.cite?.nom ?? null,
      orderPriority: up.order_priority,
    }));

    const allProfilIds = userProfils.map((up) => up.profil_id);

    let active = userProfils[0];
    if (opts?.userProfilId) {
      const forced = userProfils.find((up) => up.id === opts.userProfilId);
      if (forced) active = forced;
    }

    const activeCode = active?.profil?.code ?? 'HABITANT';
    const activeCiteId = active?.cite_id ?? null;

    // Features = union des profils DE LA MÊME CITÉ que le profil actif.
    // Un utilisateur « HABITANT + SYNDIC » de la même cité conserve les
    // actions habitant (INCIDENT_CREATE, CONFLIT_CREATE, ALERTE_CREATE…) même
    // quand son profil actif est SYNDIC. Les profils globaux (cite_id null,
    // super-admin) ne s'ajoutent que si le contexte actif est lui-même global.
    const profileIdsForFeatures = userProfils
      .filter(
        (up) =>
          (up.cite_id == null && activeCiteId == null) ||
          up.cite_id === activeCiteId,
      )
      .map((up) => up.profil_id);

    let features: string[] = [];

    if (profileIdsForFeatures.length > 0) {
      const rows = await this.prisma.$queryRawUnsafe<{ feature_code: string }[]>(
        `SELECT DISTINCT f.code AS feature_code
         FROM profil_feature pf
         JOIN feature f ON f.id = pf.feature_id
         WHERE pf.profil_id = ANY($1::int[])
           AND pf.is_deleted = FALSE
           AND f.is_deleted = FALSE
           AND pf.valid_from <= CURRENT_TIMESTAMP
           AND (pf.valid_until IS NULL OR pf.valid_until > CURRENT_TIMESTAMP)`,
        profileIdsForFeatures,
      );
      features = rows.map((r) => r.feature_code);
    }

    const versions = await this.prisma.$queryRawUnsafe<{ profil_id: number; version_tag: string }[]>(
      `SELECT DISTINCT pf.profil_id, pf.version_tag
       FROM profil_feature pf
       WHERE pf.profil_id = ANY($1::int[])
         AND pf.is_deleted = FALSE
         AND pf.valid_from <= CURRENT_TIMESTAMP
         AND (pf.valid_until IS NULL OR pf.valid_until > CURRENT_TIMESTAMP)`,
      allProfilIds,
    );

    const profilVersions: Record<number, string> = {};
    for (const v of versions) {
      profilVersions[Number(v.profil_id)] = v.version_tag;
    }

    return {
      userId,
      userProfilId: active?.id ?? null,
      role: activeCode,
      citeId: activeCiteId,
      mustChangePassword: false,
      profils,
      features,
      profilVersions,
    };
  }

  // ── Construction réponse auth ───────────────────────────────
  private async buildAuthResponse(
    userId: string,
    opts?: SessionOptions,
  ): Promise<AuthResponseDto> {
    let session = await this.refreshSession(userId, opts);

    // Plus aucun profil actif (cité(s) désactivée(s) et aucun profil global) :
    // on refuse l'accès au lieu de laisser un compte à rôle vide.
    if (session.profils.length === 0) {
      throw new ForbiddenException({
        code: 'CITE_INACTIVE',
        message: "Votre cité a été désactivée. Contactez l'administrateur.",
      });
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, is_deleted: false },
    });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: session.role,
      cite_id: session.citeId,
      must_change_password: user.must_change_password ?? false,
    };

    const access_token = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      { secret: this.config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: this.config.getOrThrow('JWT_REFRESH_EXPIRY') },
    );
    await this.redis.set(`${REFRESH_PREFIX}${user.id}`, refreshToken);

    if (user.must_change_password) {
      session = { ...session, mustChangePassword: true };
      await this.redis.set(
        `${SESSION_PREFIX}${userId}`,
        JSON.stringify(session),
        'EX',
        parseInt(this.config.get('REDIS_SESSION_TTL_SECONDS') || '86400', 10),
      );
    }

    return {
      user: {
        id: user.id,
        prenom: user.prenom,
        nom: user.nom,
        email: user.email,
        telephone: user.telephone,
        is_active: user.is_active ?? true,
        must_change_password: user.must_change_password ?? false,
      },
      profils: session.profils,
      profil_actif_user_profil_id: session.userProfilId,
      features: session.features,
      access_token,
      refresh_token: refreshToken,
      token_type: 'Bearer',
    };
  }

  private async auditAction(
    userId: string,
    action: string,
    entite: string,
    entiteId: string,
    citeId: string | null,
  ) {
    try {
      await this.prisma.audit_log.create({
        data: {
          cite_id: citeId,
          user_id: userId,
          action,
          entite,
          entite_id: entiteId,
          created_at: new Date(),
        } as any,
      });
    } catch (e) {
      this.logger.warn(`Audit write failed: ${String(e)}`);
    }
  }
}