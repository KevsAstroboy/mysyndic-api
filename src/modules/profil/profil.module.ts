import { Module } from '@nestjs/common';
import { ProfilFeatureController } from './profil-feature.controller';
import { ProfilFeatureService } from './profil-feature.service';

@Module({
  controllers: [ProfilFeatureController],
  providers: [ProfilFeatureService],
  exports: [ProfilFeatureService],
})
export class ProfilModule {}