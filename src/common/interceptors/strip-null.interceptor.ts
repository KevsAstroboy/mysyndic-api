import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function isRawResponse(data: unknown): boolean {
  if (data === null || data === undefined || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.pipe === 'function' &&
    typeof d.setHeader === 'function' &&
    typeof d.status === 'function' &&
    typeof d.json === 'function'
  );
}

function stripNullDeep(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof StreamableFile) return value;
  if (isRawResponse(value)) return value;

  if (Array.isArray(value)) {
    return value.map((item) => stripNullDeep(item)).filter((item) => item !== undefined);
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = stripNullDeep(val);
      if (cleaned !== undefined) {
        out[key] = cleaned;
      }
    }
    return out;
  }

  return value;
}

/**
 * Supprime récursivement les clés null/undefined des réponses JSON.
 * Conserve false/0/''. Exclut StreamableFile et réponses brutes express.
 */
@Injectable()
export class StripNullInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile || isRawResponse(data)) return data;
        const cleaned = stripNullDeep(data);
        return cleaned === undefined ? {} : cleaned;
      }),
    );
  }
}