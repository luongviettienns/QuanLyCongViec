import { INestApplication, ValidationPipe } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { PrismaClientExceptionFilter } from '../src/common/index.js';

export function configureTestApp(app: INestApplication<App>): INestApplication<App> {
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

  return app;
}
