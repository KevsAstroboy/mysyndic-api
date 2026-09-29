import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { type ServerOptions } from 'socket.io';
import Redis from 'ioredis';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { DateFormatInterceptor } from './common/interceptors/date-format.interceptor';
import { StripNullInterceptor } from './common/interceptors/strip-null.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    rawBody: true,
  });

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const pub = new Redis(redisUrl);
    const sub = pub.duplicate();
    // On étend IoAdapter et on passe par `super.createIOServer` : celui-ci
    // rattache le serveur Socket.IO au HTTP server de Nest. Un `new Server(port)`
    // direct créerait un serveur détaché → /socket.io en 404 (aucun temps réel).
    class RedisIoAdapter extends IoAdapter {
      createIOServer(port: number, options?: ServerOptions) {
        const server = super.createIOServer(port, options);
        server.adapter(createAdapter(pub, sub));
        return server;
      }
    }
    app.useWebSocketAdapter(new RedisIoAdapter(app));
  } else {
    app.useWebSocketAdapter(new IoAdapter(app));
  }

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new DateFormatInterceptor(), new StripNullInterceptor());

  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('MySyndic API')
    .setDescription('Backend MySyndic — gestion de cité résidentielle')
    .setVersion('0.1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`MySyndic API running on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Swagger docs at http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap();