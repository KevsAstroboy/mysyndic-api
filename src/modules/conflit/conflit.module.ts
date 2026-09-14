import { Module } from '@nestjs/common';
import { ConflitController } from './conflit.controller';
import { ConflitService } from './conflit.service';

@Module({
  controllers: [ConflitController],
  providers: [ConflitService],
  exports: [ConflitService],
})
export class ConflitModule {}