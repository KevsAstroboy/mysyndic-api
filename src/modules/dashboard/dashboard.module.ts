import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PaiementModule } from '../paiement/paiement.module';

@Module({
  imports: [PaiementModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
