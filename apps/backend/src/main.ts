import dotenv from 'dotenv';
import { access } from 'node:fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { NextFunction, Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { PrismaClientExceptionFilter } from './common/index.js';
import { loadVaultEnv } from './config/vault-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

async function bootstrap() {
  await loadVaultEnv();
  const { AppModule, ObserveInstrument } = await import('./app.module.js');

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    {
      instrument: ObserveInstrument,
    },
  );

  app.set('trust proxy', 1);

  const frontendDistDir = process.env.FRONTEND_DIST_DIR;
  if (frontendDistDir) {
    const root = path.resolve(frontendDistDir);
    const indexFile = path.join(root, 'index.html');
    await access(indexFile);

    app.useStaticAssets(root);
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.get(
      /^\/(?!api(?:\/|$)|health(?:\/|$)|assets(?:\/|$)).*$/i,
      (request: Request, response: Response, next: NextFunction) => {
        if (request.accepts('html')) {
          response.sendFile(indexFile);
          return;
        }
        next();
      },
    );
  }

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : !frontendDistDir;
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
