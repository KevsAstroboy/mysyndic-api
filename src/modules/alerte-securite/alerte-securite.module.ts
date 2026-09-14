import { Module } from '@nestjs/common';
import { AlerteController } from './alerte-securite.controller';
import { AlerteService } from './alerte-securite.service';

@Module({
  controllers: [AlerteController],
  providers: [AlerteService],
  exports: [AlerteService],
})
export class AlerteSecuriteModule {}