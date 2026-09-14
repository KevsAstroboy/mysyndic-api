import { Module } from '@nestjs/common';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { MessageContentService } from '../../message/message-content.service';

@Module({
  controllers: [MessageController],
  providers: [MessageService, MessageContentService],
  exports: [MessageService],
})
export class MessageModule {}