import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';

/*  The nightly snapshot — DEC-INT-002, INT-R05.

    Shaped after marketing/automation.service.ts, deliberately, including the
    part that matters most: THIS IS RECONCILIATION, NOT A CRON PROMISE.

    It never asks "did last night's run happen?". It asks "which days are
    missing?" and fills every one of them. That difference is the whole design.
    A hook that fails, fails silently, and nobody finds out until the number it
    was supposed to write is needed. A sweep that hunts for gaps cannot fail
    silently — the gap is still there on the next pass, and gets filled then.

    The shop laptop is not on at 2 AM. So there is also a catch-up shortly after
    boot, and an hourly retry, and any of the three doing the work is fine
    because filling a day that is already filled is a no-op.  */

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const NIGHTLY_HOUR_BD = 0;
const NIGHTLY_MINUTE_BD = 30; // 00:30 BD — safely after the day has closed
const HOURLY_MS = 60 * 60 * 1000;
const CATCHUP_AFTER_BOOT_MS = 120_000;

@Injectable()
export class IntelligenceAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('IntelligenceSweep');
  private nightlyTimer?: NodeJS.Timeout;
  private hourlyTimer?: NodeJS.Timeout;
  private last: { ranAt: string; filled: number; days: string[] } | null = null;

  constructor(private readonly intelligence: IntelligenceService) {}

  onModuleInit() {
    this.scheduleNightly();
    this.hourlyTimer = setInterval(() => void this.safeRun('hourly'), HOURLY_MS);
    this.hourlyTimer.unref?.();
    // the laptop was probably off overnight — catch up once it is on
    setTimeout(() => void this.safeRun('boot'), CATCHUP_AFTER_BOOT_MS).unref?.();
  }

  onModuleDestroy() {
    if (this.nightlyTimer) clearTimeout(this.nightlyTimer);
    if (this.hourlyTimer) clearInterval(this.hourlyTimer);
  }

  private scheduleNightly() {
    const now = Date.now();
    const bdNow = new Date(now + BD_OFFSET_MS);
    const next =
      Date.UTC(
        bdNow.getUTCFullYear(),
        bdNow.getUTCMonth(),
        bdNow.getUTCDate(),
        NIGHTLY_HOUR_BD,
        NIGHTLY_MINUTE_BD,
      ) - BD_OFFSET_MS;
    const at = next > now ? next : next + DAY_MS;
    this.nightlyTimer = setTimeout(() => {
      void this.safeRun('nightly');
      this.scheduleNightly();
    }, at - now);
    this.nightlyTimer.unref?.();
    this.logger.log(`next intelligence snapshot at ${new Date(at).toISOString()}`);
  }

  /** a background failure must never take the API down with it */
  private async safeRun(scope: 'nightly' | 'hourly' | 'boot') {
    try {
      const r = await this.intelligence.reconcile();
      this.last = { ranAt: new Date().toISOString(), ...r };
      if (r.filled > 0) this.logger.log(`[${scope}] filled ${r.filled} day(s)`);
    } catch (e) {
      this.logger.error(
        `intelligence sweep failed (${scope}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  lastRun() {
    return this.last;
  }

  /** the button on the screen, for anyone who wants it this second */
  async runNow() {
    const r = await this.intelligence.reconcile();
    this.last = { ranAt: new Date().toISOString(), ...r };
    return this.last;
  }
}
