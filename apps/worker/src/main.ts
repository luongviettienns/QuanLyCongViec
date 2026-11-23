import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadVaultEnv } from '@taskflow/shared/vault';

async function bootstrap() {
  const logger = new Logger('WorkerBootstrap');
  const vaultResult = await loadVaultEnv();
  if (vaultResult.loaded) {
    logger.log(`[Vault] Loaded ${vaultResult.keysCount} environment keys into memory.`);
  }

  const { WorkerModule } = await import('./worker.module.js');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();

  logger.log('TaskFlow Worker Service started (Cron scheduler active).');
}

await bootstrap();
