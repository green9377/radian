import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OrderMessagesService } from './order-messages.service';
import { CheckoutLeadsService } from './checkout-leads.service';
import { MessagingSettingsService } from './messaging-settings.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  SWEEPER — "পরে পাঠাও" বলে যা কিছু জমা থাকে, তা তুলে নিয়ে পাঠায়।
  DEC-WA-007।

  ⚠️ `@nestjs/schedule` ব্যবহার করা হয়নি ইচ্ছাকৃতভাবে। আমাদের দরকার একটাই
  জিনিস — "প্রতি কয়েক মিনিটে একবার"। তার জন্য নতুন নির্ভরতা যোগ করলে
  প্রত্যেককে `npm install` চালাতে হতো, আর cron expression-এর ভাষা শেখার
  দরকারও এখানে নেই। setInterval-ই যথেষ্ট।

  ⚠️ DEMO-তে বন্ধ, REAL-এ চালু (মালিকের সিদ্ধান্ত)। কারণ ফ্রি Postgres-এ
  মাসিক compute-hour সীমা আছে — প্রতি কয়েক মিনিটে DB জাগানো মানে কোটা
  কয়েক দিনে শেষ। ঠিক এই কারণেই `/health` কখনো DB ছোঁয় না (CLAUDE.md §৫)।
  Demo-তে হাতে চালানোর জন্য admin-এ বোতাম আছে।

  ⚠️ সেটিং ডেটাবেজ থেকে পড়া হয়, তাই প্রতি চক্রে আবার দেখা হয় — admin থেকে
  বন্ধ করলে পরের চক্রেই থেমে যাবে, deploy লাগবে না।

  ⚠️ একটা চক্র শেষ না হলে পরেরটা শুরু হয় না (`running` পাহারা)। নাহলে
  ধীর একটা চক্রের উপর আরেকটা চেপে বসত আর একই সারি দুবার তোলা হতো —
  ডেটাবেজের unique তখন বাঁচাত, কিন্তু বাঁচানোর দরকারই বা কেন।
  ═══════════════════════════════════════════════════════════════════════════
*/

@Injectable()
export class MessagingSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('MessagingSweeper');
  private timer?: NodeJS.Timeout;
  private running = false;
  /** দিনে একবারের কাজ (পুরনো lead মোছা) — শেষ কবে চলেছে */
  private lastPurge = 0;

  constructor(
    private readonly orderMessages: OrderMessagesService,
    private readonly leads: CheckoutLeadsService,
    private readonly settings: MessagingSettingsService,
  ) {}

  onModuleInit() {
    /*  ঘড়িটা সবসময় চলে, কিন্তু ভেতরে ঢুকেই সেটিং দেখে ফিরে আসে। এভাবে
        admin থেকে চালু করলে API আবার চালু করতে হয় না।  */
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

  /** একটা পূর্ণ চক্র। admin-এর "এখনই চালান" বোতামও এটাই ডাকে। */
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
    // পুরনো lead মোছা দিনে একবারই — প্রতি চক্রে করার মতো কাজ নয়
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
