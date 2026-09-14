import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: unknown, user: TUser): TUser {
    if (err) {
      // Préserve le statut (ex. ForbiddenException CITE_INACTIVE) au lieu de
      // tout réduire à un 401 générique.
      if (err instanceof HttpException) throw err;
      throw new UnauthorizedException('Authentification requise');
    }
    if (!user) {
      throw new UnauthorizedException('Authentification requise');
    }
    return user;
  }
}