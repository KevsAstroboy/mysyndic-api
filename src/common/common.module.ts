import { Global, Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { NotifService } from './services/notif.service';
import { RequestIdMiddleware } from './middlewares/request-id.middleware';
import { CriteriaService } from './criteria/criteria.service';
import { UploadService } from './services/upload.service';

@Global()
@Module({
  providers: [NotifService, CriteriaService, UploadService],
  exports: [NotifService, CriteriaService, UploadService],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}