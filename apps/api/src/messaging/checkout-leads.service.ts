import { Injectable, Logger } from '@nestjs/common';
import { CheckoutLeadStatus, CheckoutStage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TPL, WhatsAppCloudService } from '../common/whatsapp-cloud';
import { MessagingSettingsService } from './messaging-settings.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  CHECKOUT LEADS — যিনি checkout-এ কিছু টাইপ করেছেন কিন্তু order করেননি।
  DEC-WA-004, DEC-WA-008।

  ⚠️ এখানে এমন মানুষের ফোন নম্বর জমা হয় যিনি কখনো কিছু কেনেননি। তাই তিনটে
  জিনিস আলোচনার বাইরে:
    ১. পাঠানোর আগে opt-out যাচাই — Meta-র চোখে এটা MARKETING template
    ২. ৯০ দিন পর সারি নিজে থেকে মুছে যাবে (মেয়াদ admin-এ বদলানো যায়)
    ৩. কার্ড/CVV/OTP কখনো এখানে আসবে না — ওগুলো আমাদের পাতাতেই আসে না

  ⚠️ order হয়ে গেলে সারিটা CONVERTED — বার্তা যাবেই না। "১৫ মিনিটের মধ্যে
  অর্ডার করে ফেললে বিরক্ত করব না" নিয়মটার বাস্তব রূপ এটাই।

  ⚠️ FAIL-SOFT: এই ফাইলের কোনো ব্যর্থতা যেন checkout আটকাতে না পারে। lead
  লেখা যায়নি মানে একটা সুযোগ হারানো; checkout ভেঙে যাওয়া মানে order হারানো।
  ═══════════════════════════════════════════════════════════════════════════
*/

/** storefront যা পাঠায় */
export interface LeadPing {
  clientKey: string;
  name?: string;
  phone?: string;
  email?: string;
  stage?: CheckoutStage;
  draft?: Record<string, unknown>;
  cart?: unknown;
  itemCount?: number;
  totalPaisa?: number;
}

/*  ⚠️ কখনো জমা হবে না এমন ঘর। storefront ভুল করে পাঠালেও এখানে ছেঁকে ফেলা
    হয় — "ফর্ম যা পাঠায় সব রেখে দাও" নিয়মটার একমাত্র ব্যতিক্রম, এবং
    ব্যতিক্রমটা সার্ভারে থাকতে হবে, ব্রাউজারের সদিচ্ছার উপর নয়।  */
const NEVER_STORE = [
  'card', 'cardnumber', 'cardno', 'cvv', 'cvc', 'pin', 'otp',
  'password', 'expiry', 'exp', 'securitycode',
];

@Injectable()
export class CheckoutLeadsService {
  private readonly log = new Logger('CheckoutLeads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly wa: WhatsAppCloudService,
    private readonly settings: MessagingSettingsService,
  ) {}

  private scrub(draft?: Record<string, unknown>) {
    if (!draft) return undefined;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) {
      const key = k.toLowerCase().replace(/[^a-z]/g, '');
      if (NEVER_STORE.some((bad) => key.includes(bad))) continue;
      if (typeof v === 'string' && v.length > 2000) continue; // কেউ কিছু ঢেলে দিচ্ছে
      out[k] = v;
    }
    return out;
  }

  /** গ্রাহক checkout-এ কিছু টাইপ করলেই storefront এটা ডাকে (throttled) */
  async ping(p: LeadPing) {
    const s = await this.settings.get();
    if (!s.recoveryEnabled || !s.abandonedEnabled) return { ok: true, stored: false };
    if (!p.clientKey?.trim()) return { ok: true, stored: false };

    const data = {
      name: p.name?.trim() || undefined,
      phone: p.phone?.replace(/\s/g, '') || undefined,
      email: p.email?.trim() || undefined,
      stage: p.stage ?? CheckoutStage.CART,
      draft: this.scrub(p.draft) as Prisma.InputJsonValue | undefined,
      cart: (p.cart ?? undefined) as Prisma.InputJsonValue | undefined,
      itemCount: p.itemCount ?? 0,
      totalPaisa: p.totalPaisa ?? 0,
      lastSeenAt: new Date(),
    };

    try {
      await this.prisma.db.checkoutLead.upsert({
        where: { clientKey: p.clientKey.trim() },
        create: { clientKey: p.clientKey.trim(), ...data },
        /*  ⚠️ CONVERTED সারিতে হাত দেওয়া হয় না। order হয়ে যাওয়ার পর
            গ্রাহক আবার checkout খুললে সারিটা OPEN হয়ে গেলে তাঁর কাছে
            "আপনার cart রাখা আছে" চলে যেত — সদ্য কেনা জিনিসের জন্য।  */
        update: { ...data },
      });
      return { ok: true, stored: true };
    } catch (e) {
      this.log.warn(`lead ping failed: ${e instanceof Error ? e.message : e}`);
      return { ok: true, stored: false }; // fail-soft — checkout কখনো আটকাবে না
    }
  }

  /** order হয়ে গেছে — এই ব্রাউজারের lead আর "ছেড়ে যাওয়া" নয় */
  async markConverted(clientKey: string | undefined, orderId: string, phone?: string) {
    try {
      const where: Prisma.CheckoutLeadWhereInput = clientKey?.trim()
        ? { clientKey: clientKey.trim() }
        : /*  clientKey না এলে নম্বর ধরে — একই মানুষ ফোন থেকে শুরু করে
              কম্পিউটারে শেষ করলেও যেন তাঁকে তাগাদা না দেওয়া হয়  */
          { phone: phone?.replace(/\s/g, ''), status: CheckoutLeadStatus.OPEN };
      if (!clientKey?.trim() && !phone) return;

      await this.prisma.db.checkoutLead.updateMany({
        where: { ...where, deletedAt: null },
        data: { status: CheckoutLeadStatus.CONVERTED, orderId },
      });
    } catch (e) {
      this.log.warn(`markConverted failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /* ═══════════════ sweep ═══════════════ */

  /** চুপ হয়ে যাওয়া lead-দের বার্তা পাঠায় (DEC-WA-004) */
  async sweepAbandoned(limit = 25) {
    const s = await this.settings.get();
    if (!s.recoveryEnabled || !s.abandonedEnabled) return { picked: 0, sent: 0, skipped: 0, failed: 0 };

    const cutoff = new Date(Date.now() - s.abandonedAfterMinutes * 60_000);
    const rows = await this.prisma.db.checkoutLead.findMany({
      where: {
        status: CheckoutLeadStatus.OPEN,
        lastSeenAt: { lte: cutoff },
        deletedAt: null,
      },
      orderBy: { lastSeenAt: 'asc' },
      take: limit,
    });

    let sent = 0, skipped = 0, failed = 0;
    const support = await this.settings.supportPhone();

    for (const l of rows) {
      const reason = await this.skipReason(l.phone, l.itemCount);
      if (reason) {
        await this.prisma.db.checkoutLead.update({
          where: { id: l.id },
          data: { status: CheckoutLeadStatus.SKIPPED, skipReason: reason },
        });
        skipped++;
        continue;
      }

      const r = await this.wa.sendRaw(
        l.phone as string,
        this.wa.template(TPL.abandoned, [l.name?.trim() || 'there', support], 'en', l.id),
      );
      await this.prisma.db.checkoutLead.update({
        where: { id: l.id },
        data: r.ok
          ? { status: CheckoutLeadStatus.MESSAGED, messageSentAt: new Date(), messageError: null }
          : !r.configured
            ? { status: CheckoutLeadStatus.SKIPPED, skipReason: 'WhatsApp is not connected' }
            : { messageError: (r.error ?? 'unknown').slice(0, 500) },
      });
      if (r.ok) sent++;
      else if (!r.configured) skipped++;
      else failed++;
    }

    return { picked: rows.length, sent, skipped, failed };
  }

  /**
   * ⚠️ opt-out যাচাই এখানেই। Marketing module-এর নিজস্ব খাতা
   * (`MarketingOptOut`) সত্য — এই টেবিল নয়। কেউ একবার "আর পাঠাবেন না"
   * বললে সেটা সব রকম promo-র জন্যই প্রযোজ্য, শুধু broadcast-এর জন্য নয়।
   */
  private async skipReason(phone: string | null, itemCount: number): Promise<string | null> {
    if (!phone?.trim()) return 'no phone was typed';
    if (itemCount < 1) return 'cart was empty';

    try {
      /*  MKT-RULE-009 — সম্মতি ফিরিয়ে নিলে সারিটা soft-delete হয়, তাই
          `deletedAt: null` ছাড়া যাচাই করলে যিনি আবার সম্মতি দিয়েছেন
          তাঁকেও চিরতরে বাদ দিয়ে রাখা হতো।  */
      const optedOut = await this.prisma.db.marketingOptOut.findFirst({
        where: {
          deletedAt: null,
          customer: { phone: phone.trim(), deletedAt: null },
        },
        select: { id: true },
      });
      if (optedOut) return 'customer has opted out of marketing';
    } catch {
      /*  ⚠️ যাচাই করা গেল না — তখন পাঠাবও না। opt-out করা কারও কাছে
          ভুল করে promo যাওয়ার চেয়ে একটা সুযোগ হারানো ভালো।  */
      return 'could not check the opt-out list';
    }
    return null;
  }

  /** মেয়াদ পেরোনো lead মুছে ফেলা (DEC-WA-008) */
  async purgeOld() {
    const s = await this.settings.get();
    const cutoff = new Date(Date.now() - s.leadRetentionDays * 86_400_000);
    /*  ⚠️ এখানে সত্যিকারের DELETE, `deletedAt` নয় — ঘরের "soft delete only"
        নিয়মের ব্যতিক্রম, এবং ব্যতিক্রমটাই উদ্দেশ্য। এটা ব্যবসার সারি নয়,
        অচেনা মানুষের ফোন নম্বর; "মুছে ফেলেছি" মানে সত্যিই মুছে ফেলা।
        CONVERTED সারি রাখা হয় — ওগুলোর সাথে order জড়িত।  */
    const r = await this.prisma.db.checkoutLead.deleteMany({
      where: { createdAt: { lt: cutoff }, status: { not: CheckoutLeadStatus.CONVERTED } },
    });
    return { deleted: r.count, olderThanDays: s.leadRetentionDays };
  }
}
