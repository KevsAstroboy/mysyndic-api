import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { FilesPreviewController } from './files-preview.controller';

@Global()
@Module({
  controllers: [FilesPreviewController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
