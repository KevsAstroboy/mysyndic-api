import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
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
  const adapter = redisUrl
    ? (() => {
        const pub = new Redis(redisUrl);
        const sub = pub.duplicate();
        const ioAdapter = new IoAdapter(app);
        ioAdapter.createIOServer = (port, options) => {
          const server = new Server(port, options);
          server.adapter(createAdapter(pub, sub));
          return server;
        };
        return ioAdapter;
      })()
    : new IoAdapter(app);
  app.useWebSocketAdapter(adapter);

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