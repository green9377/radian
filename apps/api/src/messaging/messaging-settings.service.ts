import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Reads the recovery settings. One place, because queue, sweeper and admin
// all need the same numbers and three copies of a default drift apart.
// With no row saved the fallbacks apply, and recoveryEnabled false means
// nothing is sent — a new database should start quiet.

export interface RecoverySettings {
  recoveryEnabled: boolean;
  paymentFailedEnabled: boolean;
  paymentFailedRetryHours: number;
  /** minutes a started gateway attempt waits before the money counts as missing */
  unpaidAfterMinutes: number;
  abandonedEnabled: boolean;
  abandonedAfterMinutes: number;
  leadRetentionDays: number;
  sweeperEnabled: boolean;
  sweeperEveryMinutes: number;
  supportPhone: string | null;
}

const FALLBACK: RecoverySettings = {
  recoveryEnabled: false,
  paymentFailedEnabled: true,
  paymentFailedRetryHours: 24,
  unpaidAfterMinutes: 15,
  abandonedEnabled: true,
  abandonedAfterMinutes: 15,
  leadRetentionDays: 90,
  sweeperEnabled: false,
  sweeperEveryMinutes: 5,
  supportPhone: null,
};

@Injectable()
export class MessagingSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<RecoverySettings> {
    try {
      const row = await this.prisma.db.messagingSetting.findFirst();
      if (!row) return FALLBACK;
      return {
        recoveryEnabled: row.recoveryEnabled,
        paymentFailedEnabled: row.paymentFailedEnabled,
        paymentFailedRetryHours: row.paymentFailedRetryHours,
        unpaidAfterMinutes: row.unpaidAfterMinutes,
        abandonedEnabled: row.abandonedEnabled,
        abandonedAfterMinutes: row.abandonedAfterMinutes,
        leadRetentionDays: row.leadRetentionDays,
        sweeperEnabled: row.sweeperEnabled,
        sweeperEveryMinutes: row.sweeperEveryMinutes,
        supportPhone: row.supportPhone,
      };
    } catch {
      return FALLBACK;
    }
  }

  /** The number shown in the messages. */
  async supportPhone(): Promise<string> {
    const s = await this.get();
    if (s.supportPhone?.trim()) return s.supportPhone.trim();
    try {
      // whatsappPhone first — that is the number customers already message.
      const c = await this.prisma.db.companySetting.findFirst({
        select: { whatsappPhone: true, publicPhone: true },
      });
      const p = c?.whatsappPhone?.trim() || c?.publicPhone?.trim();
      if (p) return p;
    } catch {
      /* no company settings — the message still goes, with a blank number */
    }
    return '';
  }
}
