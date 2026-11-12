import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, ObserveInstrument } from './app.module.js';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { PrismaClientExceptionFilter } from './common/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    {
      instrument: ObserveInstrument,
    },
  );

  app.set('trust proxy', 1);

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : true;
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.setGlobalPrefix('api', {
    exclude: ['/', 'health'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new PrismaClientExceptionFilter());

  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('TaskFlow API')
      .setDescription(' Quản Lý Cong Việc')
      .setVersion('1.0')
      .addTag('Tasks')
      .build();

    const swaggerDocument = () =>
      SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('api/docs', app, swaggerDocument);
    SwaggerModule.setup('docs', app, swaggerDocument);
  }

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
