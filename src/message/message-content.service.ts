import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mongoose from 'mongoose';

interface MessageContent {
  message_id: string;
  contenu: string;
  type_document?: string;
  created_at: Date;
}

@Injectable()
export class MessageContentService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MessageContentService.name);
  private collection: mongoose.mongo.Collection<MessageContent> | null = null;
  private connected = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    try {
      const uri =
        this.config.get('MONGO_URI') ||
        'mongodb://localhost:27018/mysyndic_messages?authSource=admin';
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      this.connected = true;
      const coll = this.config.get('MONGO_MSG_COLLECTION') || 'messages';
      this.collection = mongoose.connection.collection<MessageContent>(coll);
      this.logger.log(`Mongo connecté (collection ${coll})`);
    } catch (e) {
      this.logger.warn(`Mongo indisponible au boot : ${String(e)}`);
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await mongoose.disconnect();
    }
  }

  private ensureReady() {
    if (!this.connected || !this.collection) {
      throw new Error('MongoDB non disponible');
    }
  }

  async insertContent(doc: {
    message_id: string;
    contenu: string;
    type_document?: string;
  }): Promise<void> {
    this.ensureReady();
    await this.collection!.insertOne({
      message_id: doc.message_id,
      contenu: doc.contenu,
      type_document: doc.type_document,
      created_at: new Date(),
    } as MessageContent);
  }

  async getContent(messageId: string): Promise<MessageContent | null> {
    this.ensureReady();
    return this.collection!.findOne({ message_id: messageId });
  }

  async getContents(messageIds: string[]): Promise<MessageContent[]> {
    if (messageIds.length === 0) return [];
    this.ensureReady();
    return this.collection!.find({ message_id: { $in: messageIds } }).toArray();
  }
}