import { Module } from '@nestjs/common';
import { CiteController } from './cite.controller';
import { CiteService } from './cite.service';
import { VillaModule } from '../villa/villa.module';
import { UserModule } from '../user/user.module';
import { ConfigurationModule } from '../configuration/configuration.module';

@Module({
  imports: [VillaModule, UserModule, ConfigurationModule],
  controllers: [CiteController],
  providers: [CiteService],
  exports: [CiteService],
})
export class CiteModule {}