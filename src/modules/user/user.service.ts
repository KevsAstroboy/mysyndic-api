import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { UploadService, isUploadEmpty } from '../../common/services/upload.service';
import { CreateStaffDto, UpdateProfileDto, CreateAdminDto, AssignProfilsDto } from './dto/user.dto';
import { JwtUser } from '../../common/types/authenticated-request.interface';

const SESSION_PREFIX = 'session:';

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly upload: UploadService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  // GET /users — liste des comptes de la cité (rôle + villa enrichis pour l'admin)
  async findAll(citeId: string) {
    const users = await this.prisma.user.findMany({
      where: { cite_id: citeId, is_deleted: false },
      orderBy: { nom: 'asc' },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        telephone: true,
        is_active: true,
        must_change_password: true,
        created_at: true,
        user_profil: {
          where: { cite_id: citeId, is_active: true, is_deleted: false },
          orderBy: { order_priority: 'asc' },
          select: {
            profil: { select: { code: true, libelle: true } },
          },
        },
        user_villa: {
          where: { is_current: true, is_deleted: false },
          select: {
            villa: { select: { id: true, numero: true, rue: true } },
          },
        },
      },
    });

    return users.map((u) => ({
      id: u.id,
      prenom: u.prenom,
      nom: u.nom,
      email: u.email,
      telephone: u.telephone,
      is_active: u.is_active,
      must_change_password: u.must_change_password,
      created_at: u.created_at,
      roles: u.user_profil.map((up) => up.profil),
      villa: u.user_villa[0]?.villa ?? null,
    }));
  }

  // GET /users/:id
  async findOne(id: string, citeId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, cite_id: citeId, is_deleted: false },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  // GET /users/me — user + villa courante + cité
  async getMe(userId: string, citeId: string | null = null) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, is_deleted: false },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const [villa, cite] = await Promise.all([
      this.prisma.user_villa.findFirst({
        where: {
          user_id: userId,
          is_current: true,
          is_deleted: false,
          // La villa est rattachée à la cité active du token (multi-cités) :
          // un habitant de la cité A ne doit pas voir sa villa de la cité B.
          ...(citeId ? { cite_id: citeId } : {}),
        },
        include: { villa: true },
      }),
      (citeId ?? user.cite_id)
        ? this.prisma.cite.findFirst({
            where: { id: citeId ?? user.cite_id!, is_deleted: false },
          })
        : null,
    ]);

    return {
      id: user.id,
      prenom: user.prenom,
      nom: user.nom,
      email: user.email,
      telephone: user.telephone,
      photo_file_path: user.photo_file_path,
      is_active: user.is_active,
      profil: 'HABITANT',
      villa: villa?.villa
        ? { id: villa.villa.id, numero: villa.villa.numero, rue: villa.villa.rue }
        : null,
      occupation_confirmee: villa ? villa.is_confirme === true : false,
      cite: cite ? { id: cite.id, nom: cite.nom } : null,
    };
  }

  // PATCH /users/:id — self update (non sensibles)
  // Photo de profil — téléversée vers MinIO, chemin enregistré sur le user.
  async setProfilePhoto(
    userId: string,
    photo: Express.Multer.File | undefined,
  ): Promise<string> {
    if (isUploadEmpty(photo)) {
      throw new BadRequestException('Fichier image requis');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cite_id: true },
    });
    const path = await this.upload.uploadPhoto(
      user?.cite_id ?? 'global',
      'avatars',
      photo!,
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: { photo_file_path: path, updated_at: new Date() },
    });
    return path;
  }

  async getPhotoPath(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { photo_file_path: true },
    });
    return user?.photo_file_path ?? null;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.telephone) {
      const existing = await this.prisma.user.findFirst({
        where: { telephone: dto.telephone, id: { not: userId }, is_deleted: false },
      });
      if (existing) {
        throw new ConflictException('Ce numéro de téléphone est déjà utilisé');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.prenom !== undefined && { prenom: dto.prenom }),
        ...(dto.nom !== undefined && { nom: dto.nom }),
        ...(dto.telephone !== undefined && { telephone: dto.telephone }),
        updated_at: new Date(),
      },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        telephone: true,
      },
    });
  }

  // POST /users/staff — création syndic / chef sécurité
  async createStaff(citeId: string, dto: CreateStaffDto, actor: JwtUser) {
    const profil = await this.prisma.profil.findFirst({
      where: { code: dto.profil_code, is_deleted: false },
    });
    if (!profil) {
      throw new BadRequestException('Profil invalide. Attendu SYNDIC ou CHEF_SECURITE');
    }
    if ((profil.code as string) === 'SUPER_ADMIN' || (profil.code as string) === 'ADMIN') {
      throw new BadRequestException('Profil non autorisé via ce endpoint');
    }

    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, is_deleted: false },
    });
    if (existing) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    const tempPassword = generateTempPassword();
    const hashed = await bcrypt.hash(tempPassword, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          cite_id: citeId,
          prenom: dto.prenom,
          nom: dto.nom,
          email: dto.email,
          telephone: dto.telephone,
          password_hash: hashed,
          must_change_password: true,
          is_active: true,
          created_at: new Date(),
          created_by: actor.sub,
        },
      });

      await tx.user_profil.create({
        data: {
          user_id: newUser.id,
          profil_id: profil.id,
          cite_id: citeId,
          order_priority: 1,
          is_active: true,
          assigned_at: new Date(),
          assigned_by: actor.sub,
          created_at: new Date(),
        },
      });

      await tx.$executeRawUnsafe(
        'CALL add_user_to_cite_groupe($1::uuid, $2::uuid)',
        newUser.id,
        citeId,
      );

      await tx.audit_log.create({
        data: {
          cite_id: citeId,
          user_id: actor.sub,
          profil_actif_code: actor.role,
          action: 'CREATE',
          entite: 'user',
          entite_id: newUser.id,
          created_at: new Date(),
        } as any,
      });

      return newUser;
    });

    const appUrl = this.config.get('FRONTEND_URL') || 'https://app.mysyndic.ci';
    this.mailService
      .sendWelcomeStaffEmail(dto.email, tempPassword, appUrl)
      .catch((e) => this.logger.error(`Welcome email failed: ${e.message}`));

    this.logger.log(`Staff created by ${actor.sub}: ${user.id} (${dto.profil_code})`);

    return {
      user: {
        id: user.id,
        prenom: user.prenom,
        nom: user.nom,
        email: user.email,
        profil: dto.profil_code,
      },
      temp_password: tempPassword,
      message:
        'Compte créé. Le mot de passe temporaire est transmis par email.',
    };
  }

  // PATCH /users/:id/activate — activate/deactivate + invalidation session
  async toggleActive(id: string, citeId: string, isActive: boolean, actor: JwtUser) {
    const user = await this.prisma.user.findFirst({
      where: { id, cite_id: citeId, is_deleted: false },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    await this.prisma.user.update({
      where: { id },
      data: { is_active: isActive, updated_at: new Date(), updated_by: actor.sub },
    });

    if (!isActive) {
      await this.redis.del(`${SESSION_PREFIX}${id}`);
    }

    await this.prisma.audit_log.create({
      data: {
        cite_id: citeId,
        user_id: actor.sub,
        profil_actif_code: actor.role,
        action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
        entite: 'user',
        entite_id: id,
        created_at: new Date(),
      } as any,
    });

    return { message: isActive ? 'Compte réactivé' : 'Compte désactivé' };
  }

  // ── SUPER_ADMIN : créer un ADMIN ─────────────────────────────
  async createAdmin(dto: CreateAdminDto, actor: JwtUser) {
    const profil = await this.prisma.profil.findFirst({
      where: { code: 'ADMIN', is_deleted: false },
    });
    if (!profil) throw new BadRequestException('Profil ADMIN introuvable');

    const cite = await this.prisma.cite.findFirst({
      where: { id: dto.cite_id, is_deleted: false },
    });
    if (!cite) throw new NotFoundException('Cité introuvable');

    const tempPassword = generateTempPassword();
    const hashed = await bcrypt.hash(tempPassword, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({ where: { email: dto.email } });
      let account: {
        id: string;
        email: string;
        prenom: string | null;
        nom: string | null;
      };
      if (existing && existing.is_deleted !== true) {
        throw new ConflictException('Cet email est déjà utilisé');
      }
      if (existing) {
        account = await tx.user.update({
          where: { id: existing.id },
          data: {
            cite_id: dto.cite_id,
            prenom: dto.prenom,
            nom: dto.nom,
            email: dto.email,
            telephone: dto.telephone ?? existing.telephone,
            password_hash: hashed,
            must_change_password: true,
            is_active: true,
            is_deleted: false,
            deleted_at: null,
            deleted_by: null,
            updated_at: new Date(),
            updated_by: actor.sub,
          },
        });
      } else {
        account = await tx.user.create({
          data: {
            cite_id: dto.cite_id,
            prenom: dto.prenom,
            nom: dto.nom,
            email: dto.email,
            telephone: dto.telephone,
            password_hash: hashed,
            must_change_password: true,
            is_active: true,
            created_at: new Date(),
            created_by: actor.sub,
          },
        });
      }

      await tx.user_profil.create({
        data: {
          user_id: account.id,
          profil_id: profil.id,
          cite_id: dto.cite_id,
          order_priority: 1,
          is_active: true,
          assigned_at: new Date(),
          assigned_by: actor.sub,
          created_at: new Date(),
        },
      });
      await tx.$executeRawUnsafe(
        'CALL add_user_to_cite_groupe($1::uuid, $2::uuid)',
        account.id,
        dto.cite_id,
      );
      await tx.audit_log.create({
        data: {
          cite_id: dto.cite_id,
          user_id: actor.sub,
          profil_actif_code: actor.role,
          action: 'CREATE',
          entite: 'user',
          entite_id: account.id,
          created_at: new Date(),
        } as any,
      });
      return account;
    });

    const appUrl = this.config.get('FRONTEND_URL') || 'https://app.mysyndic.ci';
    this.mailService
      .sendWelcomeStaffEmail(dto.email, tempPassword, appUrl)
      .catch((e) => this.logger.error(`Welcome email failed: ${e.message}`));

    return {
      user: {
        id: user.id,
        prenom: user.prenom,
        nom: user.nom,
        email: user.email,
        profil: 'ADMIN',
        cite_id: dto.cite_id,
      },
      temp_password: tempPassword,
      message: 'Compte administrateur créé. Mot de passe temporaire transmis par email.',
    };
  }

  // ── SUPER_ADMIN : assigner plusieurs profils à un user ──────
  async assignProfils(targetUserId: string, dto: AssignProfilsDto, actor: JwtUser) {
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, is_deleted: false },
    });
    if (!target) throw new NotFoundException('Utilisateur introuvable');

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.profils) {
        const profil = await tx.profil.findFirst({
          where: { code: item.profil_code, is_deleted: false },
        });
        if (!profil) {
          throw new BadRequestException(`Profil inconnu : ${item.profil_code}`);
        }
        if (profil.code === 'SUPER_ADMIN' && item.cite_id) {
          throw new BadRequestException('SUPER_ADMIN doit être sans cité (global)');
        }
        if (profil.code !== 'SUPER_ADMIN' && !item.cite_id) {
          throw new BadRequestException(`Cité requise pour le profil ${profil.code}`);
        }
        if (item.cite_id) {
          const cite = await tx.cite.findFirst({
            where: { id: item.cite_id, is_deleted: false },
          });
          if (!cite) throw new NotFoundException(`Cité introuvable : ${item.cite_id}`);
        }

        const existing = await tx.user_profil.findFirst({
          where: {
            user_id: targetUserId,
            profil_id: profil.id,
            ...(profil.code === 'SUPER_ADMIN' ? { cite_id: null } : { cite_id: item.cite_id }),
          },
        });

        const data = {
          order_priority: item.order_priority ?? 1,
          is_active: true,
          is_deleted: false,
          revoked_at: null,
          revoked_by: null,
          deleted_at: null,
          deleted_by: null,
          assigned_at: new Date(),
          assigned_by: actor.sub,
          updated_at: new Date(),
        };

        if (existing) {
          await tx.user_profil.update({ where: { id: existing.id }, data });
        } else {
          await tx.user_profil.create({
            data: {
              user_id: targetUserId,
              profil_id: profil.id,
              cite_id: profil.code === 'SUPER_ADMIN' ? null : item.cite_id!,
              order_priority: item.order_priority ?? 1,
              is_active: true,
              assigned_at: new Date(),
              assigned_by: actor.sub,
              created_at: new Date(),
            },
          });
        }

        if (item.cite_id) {
          await tx.$executeRawUnsafe(
            'CALL add_user_to_cite_groupe($1::uuid, $2::uuid)',
            targetUserId,
            item.cite_id!,
          );
        }
      }

      await tx.audit_log.create({
        data: {
          cite_id: target.cite_id,
          user_id: actor.sub,
          profil_actif_code: actor.role,
          action: 'ASSIGN_PROFIL',
          entite: 'user_profil',
          entite_id: targetUserId,
          created_at: new Date(),
        } as any,
      });
    });

    await this.redis.del(`${SESSION_PREFIX}${targetUserId}`);
    return this.targetProfils(targetUserId);
  }

  async removeProfil(targetUserId: string, userProfilId: string, actor: JwtUser) {
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, is_deleted: false },
    });
    if (!target) throw new NotFoundException('Utilisateur introuvable');

    const up = await this.prisma.user_profil.findFirst({
      where: { id: userProfilId, user_id: targetUserId, is_deleted: false },
    });
    if (!up) throw new NotFoundException('Profil non trouvé sur cet utilisateur');

    const activeCount = await this.prisma.user_profil.count({
      where: { user_id: targetUserId, is_deleted: false, is_active: true },
    });
    if (activeCount <= 1 && up.is_active) {
      throw new BadRequestException('Impossible : l utilisateur doit garder au moins un profil actif');
    }

    await this.prisma.user_profil.update({
      where: { id: userProfilId },
      data: {
        is_deleted: true,
        is_active: false,
        revoked_at: new Date(),
        revoked_by: actor.sub,
        deleted_at: new Date(),
        deleted_by: actor.sub,
        updated_at: new Date(),
      },
    });
    await this.redis.del(`${SESSION_PREFIX}${targetUserId}`);
    return this.targetProfils(targetUserId);
  }

  private async targetProfils(userId: string) {
    const rows = await this.prisma.user_profil.findMany({
      where: { user_id: userId, is_deleted: false, is_active: true },
      orderBy: { order_priority: 'asc' as const },
      include: {
        profil: { select: { id: true, code: true, libelle: true } },
        cite: { select: { id: true, nom: true } },
      },
    });
    return {
      user_id: userId,
      profils: rows.map((r) => ({
        user_profil_id: r.id,
        profil_id: r.profil_id,
        code: r.profil?.code,
        libelle: r.profil?.libelle,
        cite_id: r.cite_id,
        cite_nom: r.cite?.nom ?? null,
        order_priority: r.order_priority,
      })),
    };
  }
}