import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest } from '../types/authenticated-request.interface';

type ActionName = 'CREATE' | 'UPDATE' | 'DELETE';

/**
 * R9 : journalise CREATE/UPDATE/DELETE sur les entités critiques.
 * S'active par route (@UseInterceptors(AuditLogInterceptor)) ou globalement.
 * Ne capture pas les secrets ; entite_id/anciennes/nouvelles valeurs arrivent
 * via arguments optionnels passés au decorator (voir AuditLog).
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      return next.handle();
    }

    const method = request.method;
    let action: ActionName | null = null;
    if (method === 'POST') action = 'CREATE';
    else if (method === 'PATCH' || method === 'PUT') action = 'UPDATE';
    else if (method === 'DELETE') action = 'DELETE';

    if (!action) {
      return next.handle();
    }

    const entite = (request.params?.entity as string) || 'unknown';
    const entiteId = (request.params?.id as string) ?? null;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: async (data) => {
          try {
            await this.prisma.audit_log.create({
              data: {
                user_id: user.sub,
                action,
                entite,
                entite_id: entiteId,
                cite_id: user.cite_id,
                profil_actif_code: user.role,
                ip_address: request.ip,
                created_at: new Date(),
              } as any,
            });
          } catch (e) {
            this.logger.warn(
              `Audit log write failed for ${action} ${entite}: ${String(e)}`,
            );
          }
        },
        error: () => {
          const duration = Date.now() - startedAt;
          if (duration > 0) {
            void duration;
          }
        },
      }),
    );
  }
}