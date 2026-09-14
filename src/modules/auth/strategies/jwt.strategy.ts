import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';

/** Cookie contenant l'access_token (posé par le frontend au login). */
const ACCESS_COOKIE = 'access_token';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Autorise le Bearer ET le cookie access_token. Indispensable pour les
      // <img src=…/photo> (un navigateur ne peut pas poser d'en-tête
      // Authorization sur une image) — sans quoi toute photo d'alerte renvoie
      // un 401 et ne s'affiche pas.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => {
          const header = req.headers?.cookie ?? '';
          const match = new RegExp(`(?:^|;\\s*)${ACCESS_COOKIE}=([^;]+)`).exec(header);
          return match ? decodeURIComponent(match[1]) : null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Le contexte actif (rôle / cité) vit dans la session Redis :
    // un switch de profil est donc effectif immédiatement, sans attendre
    // un nouveau token.
    let session = await this.authService.getSession(payload.sub);
    if (!session) {
      try {
        session = await this.authService.refreshSession(payload.sub);
      } catch (e) {
        this.logger.warn(`Session refresh failed pour ${payload.sub}: ${String(e)}`);
      }
    }
    const citeId = session?.citeId ?? payload.cite_id;

    // Désactivation de cité : on coupe immédiatement les sessions actives de
    // la cité, sans toucher aux comptes ni aux autres cités d'un multi-profil.
    if (citeId) {
      const cite = await this.prisma.cite.findUnique({
        where: { id: citeId },
        select: { is_active: true },
      });
      if (!cite || cite.is_active === false) {
        throw new ForbiddenException({
          code: 'CITE_INACTIVE',
          message: "Votre cité a été désactivée. Contactez l'administrateur.",
        });
      }
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: session?.role ?? payload.role,
      cite_id: citeId,
      must_change_password: payload.must_change_password,
    };
  }
}