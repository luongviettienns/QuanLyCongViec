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

  // Backward compatibility middleware for test suites during migration to /api
  app.use((req: any, _res: any, next: () => void) => {
    if (
      req.url &&
      req.url !== '/' &&
      !req.url.startsWith('/health') &&
      !req.url.startsWith('/api')
    ) {
      req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
    next();
  });

  return app;
}
