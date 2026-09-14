import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './prisma/prisma.module';
import { MigrationsModule } from './prisma/migrations.module';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';
import { StorageModule } from './storage/storage.module';
import { SocketsModule } from './sockets/sockets.module';
import { AuthModule } from './modules/auth/auth.module';
import { CiteModule } from './modules/cite/cite.module';
import { VillaModule } from './modules/villa/villa.module';
import { UserModule } from './modules/user/user.module';
import { ConfigurationModule } from './modules/configuration/configuration.module';
import { PaiementModule } from './modules/paiement/paiement.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { AnnonceModule } from './modules/annonce/annonce.module';
import { AlerteSecuriteModule } from './modules/alerte-securite/alerte-securite.module';
import { IncidentModule } from './modules/incident/incident.module';
import { ConflitModule } from './modules/conflit/conflit.module';
import { MessageModule } from './modules/message/message.module';
import { DocumentModule } from './modules/document/document.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ProfilModule } from './modules/profil/profil.module';
import { FeedModule } from './modules/feed/feed.module';
import { buildLoggerParams } from './common/logger/logger.config';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      useFactory: () => buildLoggerParams(),
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    CommonModule,
    PrismaModule,
    MigrationsModule,
    RedisModule,
    MailModule,
    StorageModule,
    SocketsModule,
    AuthModule,
    CiteModule,
    VillaModule,
    UserModule,
    ConfigurationModule,
    PaiementModule,
    WebhookModule,
    AnnonceModule,
    AlerteSecuriteModule,
    IncidentModule,
    ConflitModule,
    MessageModule,
    DocumentModule,
    DashboardModule,
    NotificationModule,
    ProfilModule,
    FeedModule,
  ],
})
export class AppModule {}
