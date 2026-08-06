import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OrderMessagesService } from './order-messages.service';
import { CheckoutLeadsService } from './checkout-leads.service';
import { MessagingSettingsService } from './messaging-settings.service';

/*
  Picks up anything queued for later and sends it.

  A plain setInterval rather than @nestjs/schedule: "every few minutes" does
  not justify a dependency. Settings are re-read each tick, so switching this
  off in admin takes effect without a deploy. Off in Demo — a timer waking a
  free Postgres burns its monthly compute quota, the same reason /health never
  touches the database.
*/

@Injectable()
export class MessagingSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('MessagingSweeper');
  private timer?: NodeJS.Timeout;
  private running = false;
  /** Purging old leads is a once-a-day job. */
  private lastPurge = 0;

  constructor(
    private readonly orderMessages: OrderMessagesService,
    private readonly leads: CheckoutLeadsService,
    private readonly settings: MessagingSettingsService,
  ) {}

  onModuleInit() {
    // The timer always runs; each tick checks the settings and usually returns.
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private lastRun = 0;

  private async tick() {
    if (this.running) return;

    const s = await this.settings.get();
    if (!s.recoveryEnabled || !s.sweeperEnabled) return;

    const everyMs = Math.max(1, s.sweeperEveryMinutes) * 60_000;
    if (Date.now() - this.lastRun < everyMs) return;

    this.running = true;
    this.lastRun = Date.now();
    try {
      await this.runOnce();
    } finally {
      this.running = false;
    }
  }

  /** One full cycle. The admin "Run now" button calls this too. */
  async runOnce() {
    const out: Record<string, unknown> = {};
    try {
      out.orderMessages = await this.orderMessages.sendDue();
    } catch (e) {
      this.log.warn(`sendDue failed: ${e instanceof Error ? e.message : e}`);
      out.orderMessages = { error: true };
    }
    try {
      out.abandoned = await this.leads.sweepAbandoned();
    } catch (e) {
      this.log.warn(`sweepAbandoned failed: ${e instanceof Error ? e.message : e}`);
      out.abandoned = { error: true };
    }
    // Purge once a day, not every cycle.
    if (Date.now() - this.lastPurge > 86_400_000) {
      this.lastPurge = Date.now();
      try {
        out.purged = await this.leads.purgeOld();
      } catch (e) {
        this.log.warn(`purgeOld failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    return out;
  }
}
