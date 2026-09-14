import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import { AuthService } from '../../modules/auth/auth.service';
import { FEATURE_KEY } from '../decorators/feature.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request.interface';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.sub;

    if (!userId) {
      throw new ForbiddenException('Authentification requise');
    }

    let session = await this.authService.getSession(userId);

    if (!session) {
      session = await this.authService.refreshSession(userId);
    } else {
      const isStale = await this.authService.isSessionStale(session);
      if (isStale) {
        session = await this.authService.refreshSession(userId);
      }
    }

    if (!session.features.includes(requiredFeature)) {
      throw new ForbiddenException(
        `Permission refusée : ${requiredFeature}`,
      );
    }

    return true;
  }
}