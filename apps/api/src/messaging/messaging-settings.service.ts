import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/*
  MessagingSetting singleton-এর পাঠক। DEC-WA-002…008।

  ⚠️ কেন আলাদা service: সংখ্যাগুলো (১৫ মিনিট, ২৪ ঘণ্টা, ৯০ দিন) ব্যবসার
  সিদ্ধান্ত, কোডের ধ্রুবক নয় (ঘরের নিয়ম ৭)। তিন জায়গা থেকে পড়া হয় —
  queue, sweeper, admin — আর তিন জায়গায় তিনটে default লেখা থাকলে একদিন
  একটা বদলে যেত আর বাকিগুলো পুরনো থেকে যেত।

  ⚠️ সারিটা না থাকলেও কিছু ভাঙে না — schema-র default গুলোই ফেরে, আর
  `recoveryEnabled: false` মানে কিছুই ঘটবে না। নতুন ডেটাবেজে প্রথম দিন
  বার্তা পাঠানো শুরু হয়ে যাওয়ার চেয়ে চুপ থাকা ভালো।
*/

export interface RecoverySettings {
  recoveryEnabled: boolean;
  paymentFailedEnabled: boolean;
  paymentFailedRetryHours: number;
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

  /** বার্তায় গ্রাহক যে নম্বরে ফোন করবেন (DEC-WA-003) */
  async supportPhone(): Promise<string> {
    const s = await this.get();
    if (s.supportPhone?.trim()) return s.supportPhone.trim();
    try {
      /*  whatsappPhone আগে — গ্রাহককে যে নম্বরে WhatsApp-এ লিখতে বলা হচ্ছে,
          সেটাই স্বাভাবিক। না থাকলে রসিদে ছাপা publicPhone।  */
      const c = await this.prisma.db.companySetting.findFirst({
        select: { whatsappPhone: true, publicPhone: true },
      });
      const p = c?.whatsappPhone?.trim() || c?.publicPhone?.trim();
      if (p) return p;
    } catch {
      /* CompanySetting নেই — নিচের খালি স্ট্রিং template-এ ফাঁকা দেখাবে,
         কিন্তু বার্তাটা আটকাবে না */
    }
    return '';
  }
}
