import { Injectable, Logger, Module, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { CosecSyncService } from './cosec-sync.service';
import { ExternalApiModule } from './external-api.module';

/** How often every workspace is synced from COSEC. */
export const COSEC_SYNC_INTERVAL_MS = 60_000;

/**
 * The COSEC sync worker: runs every workspace's sync once a minute. A round
 * that is still running when the next is due is not overlapped; the next one
 * starts when it ends. Several workers may run: each workspace is claimed for
 * its run, so it is never synced twice at once.
 */
@Injectable()
export class CosecSyncWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('CosecSyncWorker');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly sync: CosecSyncService) {}

  onApplicationBootstrap() {
    this.logger.log(`COSEC sync worker started: every ${COSEC_SYNC_INTERVAL_MS / 1000} seconds`);
    void this.round();
    this.timer = setInterval(() => void this.round(), COSEC_SYNC_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One round over every due workspace; skipped while the previous round is still running. */
  async round() {
    if (this.running) return;
    this.running = true;
    const started = Date.now();
    try {
      const synced = await this.sync.runAll();
      if (synced) this.logger.debug(`COSEC sync round: workspaces=${synced} durationMs=${Date.now() - started}`);
    } catch (error) {
      // A database outage, for instance: the next round tries again.
      this.logger.error(`COSEC sync round failed: ${error instanceof Error ? error.name : 'unknown'}`);
    } finally {
      this.running = false;
    }
  }
}

/** Everything the worker process needs, and no web server. */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }), PrismaModule, AuditModule, ExternalApiModule],
  providers: [CosecSyncWorker],
})
export class CosecSyncWorkerModule {}
