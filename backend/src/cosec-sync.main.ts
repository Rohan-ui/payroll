import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CosecSyncWorkerModule } from './modules/external-api/cosec-sync.worker';

/**
 * The COSEC sync worker process: syncs attendance from every workspace's COSEC
 * server once a minute. It runs beside the API (which serves the on-demand
 * refresh when an employee's attendance is opened), and can be restarted on its
 * own. Start it with `npm run start:cosec-sync` (or `start:cosec-sync:prod`).
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(CosecSyncWorkerModule);
  // Stops cleanly on SIGTERM/SIGINT: the timer is cleared and the database disconnected.
  app.enableShutdownHooks();
}

bootstrap().catch((error) => {
  new Logger('CosecSyncWorker').error(`The COSEC sync worker could not start: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(1);
});
