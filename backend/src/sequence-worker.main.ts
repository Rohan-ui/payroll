import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SequenceWorkerModule } from './modules/email-sequences/sequence.worker';

/**
 * The drip sequence worker process: sends due sequence emails, runs automatic
 * enrollment rules and reads sending inboxes for replies and bounces, once a
 * minute. Without it running, nothing is sent: the API only schedules. It can
 * be restarted on its own; several may run. Start it with
 * `npm run start:sequence-worker` (or `start:sequence-worker:prod`).
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(SequenceWorkerModule);
  app.enableShutdownHooks();
}

bootstrap().catch((error) => {
  new Logger('SequenceWorker').error(`The sequence worker could not start: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(1);
});
