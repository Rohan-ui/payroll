import { Injectable, Logger, Module, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@/prisma/prisma.module';
import { AccessModule } from '@/common/access/access.module';
import { EmailSequencesModule } from './email-sequences.module';
import { SequenceAutomationService } from './sequence-automation.service';
import { SequenceInboxService } from './sequence-inbox.service';
import { SequenceSenderService } from './sequence-sender.service';

/** How often the worker runs a round. */
export const SEQUENCE_ROUND_MS = 60_000;

/**
 * The sequence worker: once a minute it gives back sends a stopped worker
 * left, runs the enrollment rules, ends enrollments of closed leads, sends
 * what is due, and reads sending inboxes for replies and bounces. A round
 * still running when the next is due is not overlapped. Several workers may
 * run: sends, rule events and mailboxes are each claimed by one of them.
 */
@Injectable()
export class SequenceWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('SequenceWorker');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly sender: SequenceSenderService,
    private readonly automation: SequenceAutomationService,
    private readonly inbox: SequenceInboxService,
  ) {}

  onApplicationBootstrap() {
    this.logger.log(`Sequence worker started: every ${SEQUENCE_ROUND_MS / 1000} seconds`);
    void this.round();
    this.timer = setInterval(() => void this.round(), SEQUENCE_ROUND_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async round() {
    if (this.running) return;
    this.running = true;
    const started = Date.now();
    // Each part on its own: one failing (a database hiccup, say) doesn't stop the others.
    const step = async <T>(name: string, run: () => Promise<T>) => {
      try {
        return await run();
      } catch (error) {
        this.logger.error(`Sequence worker ${name} failed: ${error instanceof Error ? error.name : 'unknown'}`);
        return null;
      }
    };
    try {
      await step('recovery', () => this.sender.recoverStale());
      const enrolled = await step('rules', () => this.automation.runRules());
      const stopped = await step('stops', () => this.automation.sweepStops());
      const sent = await step('sending', () => this.sender.sendDue());
      const scanned = await step('inboxes', () => this.inbox.scanAll());
      if (enrolled || stopped || sent?.claimed || scanned) {
        this.logger.log(`Sequence round: enrolled=${enrolled ?? 0} stopped=${stopped ?? 0} claimed=${sent?.claimed ?? 0} sent=${sent?.sent ?? 0} inboxes=${scanned ?? 0} durationMs=${Date.now() - started}`);
      }
    } finally {
      this.running = false;
    }
  }
}

/** Everything the worker process needs, and no web server. */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }), PrismaModule, AccessModule, EmailSequencesModule],
  providers: [SequenceWorker],
})
export class SequenceWorkerModule {}
