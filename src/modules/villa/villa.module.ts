import { Module } from '@nestjs/common';
import { VillaController } from './villa.controller';
import { VillaService } from './villa.service';
import { PublicOnboardingController } from './public-onboarding.controller';

@Module({
  controllers: [VillaController, PublicOnboardingController],
  providers: [VillaService],
  exports: [VillaService],
})
export class VillaModule {}
