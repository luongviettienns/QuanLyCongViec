import { INestApplication, ValidationPipe } from '@nestjs/common';
import { App } from 'supertest/types.js';

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

  return app;
}
