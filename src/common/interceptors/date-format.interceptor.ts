import { Injectable, NestInterceptor, ExecutionContext, CallHandler, StreamableFile } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { transformDates } from '../utils/date-format.util';

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

@Injectable()
export class DateFormatInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const customFormat = request.query?.dateFormat as string | undefined;

    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile) return data;
        if (isRawResponse(data)) return data;
        return transformDates(data, customFormat);
      }),
    );
  }
}