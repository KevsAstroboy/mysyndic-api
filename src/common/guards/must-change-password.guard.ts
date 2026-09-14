import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

export const IS_PUBLIC_KEY = 'is_public';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Guard GLOBAL (APP_GUARD) : combine l'authentification JWT (AuthGuard('jwt'))
 * et le blocage must_change_password (R3).
 *
 * - Routes @Public() (login, register, refresh, forgot, reset) : pas de JWT.
 * - Les autres : JWT obligatoire puis, si must_change_password = TRUE et route
 *   != POST /auth/change-password → 403 MUST_CHANGE_PASSWORD.
 */
@Injectable()
export class MustChangePasswordGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublicRoute(context)) {
      return true;
    }

    const canActivate = (await super.canActivate(context)) as boolean;
    if (!canActivate) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (user && user.must_change_password) {
      const isChangePassword =
        request.method === 'POST' &&
        request.path?.includes('/auth/change-password');
      if (!isChangePassword) {
        throw new ForbiddenException({
          code: 'MUST_CHANGE_PASSWORD',
          message: 'Vous devez changer votre mot de passe avant de continuer.',
        });
      }
    }

    return true;
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    return this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  }
}