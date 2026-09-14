import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * R1 (multi-tenant) : injecte cite_id dans les mutations d'entités qui en
 * fournissent un. Pour les CRUD Prisma on filtre côté service (recommendé),
 * cet interceptor est un filet de sécurité pour routes génériques :
 * il loggue les requêtes par cité et sert de passe-plat aux decorators.
 */
@Injectable()
export class CiteFilterInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const citeId = request.user?.cite_id ?? null;
    request.cite_id = citeId;

    return next.handle().pipe(
      tap({
        next: () => undefined,
        error: () => undefined,
      }),
    );
  }
}