import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const rid = (req as { id?: string }).id;
    if (rid) {
      res.setHeader('X-Request-Id', rid);
    }
    next();
  }
}