import { Injectable, Logger } from '@nestjs/common';
import { OrderMessageKind, OrderMessageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TPL, WhatsAppCloudService } from '../common/whatsapp-cloud';
import { MessagingSettingsService } from './messaging-settings.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  ORDER MESSAGES — এক order নিয়ে গ্রাহককে পাঠানো প্রতিটা বার্তার একমাত্র পথ।
  DEC-WA-002…005।

  ⚠️ কেন এই স্তরটা দরকার হলো। আগে বার্তা পাঠানো হতো সরাসরি
  `whatsappCloud.orderOut(...)` ডেকে — void, fire-and-forget। ফলে:
    · "গ্রাহক confirmation পেয়েছিলেন কি না" — কারও কাছে উত্তর নেই
    · "২৪ ঘণ্টা পর আবার পাঠাও" — প্রথমটা গেছে কিনা না জেনে বলা যায় না
    · একই বার্তা দুবার যাওয়া ঠেকানোর কিছু নেই
  এখন প্রতিটা বার্তা আগে **সারি হিসেবে লেখা হয়**, তারপর পাঠানো হয়। সারিটাই
  ইতিহাস, আর সারিটাই দ্বিতীয়বার পাঠানো ঠেকায়।

  ⚠️ QUEUE আগে, পাঠানো পরে — উল্টো নয়। পাঠিয়ে তারপর লিখতে গেলে, লেখার
  আগে process মরলে বার্তা গেছে অথচ কোথাও লেখা নেই — পরের sweep আবার
  পাঠাবে। এখন উল্টোটা ঘটে: লেখা আছে অথচ পাঠানো হয়নি, আর পরের sweep
  সেটা তুলে নেবে। দুটো ভুলের মধ্যে এটাই কম ক্ষতিকর।

  ⚠️ FAIL-SOFT সর্বত্র। বার্তা একটা সৌজন্য; order-টা চুক্তি। WhatsApp-এর
  কোনো ব্যর্থতা কখনো order আটকাবে না।
  ═══════════════════════════════════════════════════════════════════════════
*/

/** কোন kind কোন template-এ যায় — এক জায়গায়, যাতে নাম বদলালে এক জায়গায় বদলায় */
const TEMPLATE_FOR: Record<OrderMessageKind, string> = {
  ORDER_CONFIRMATION: TPL.confirm,
  ORDER_CONFIRMATION_COD: TPL.confirmCod,
  ORDER_OUT_FOR_DELIVERY: TPL.out,
  ORDER_DELIVERED: TPL.delivered,
  PAYMENT_FAILED: TPL.paymentFailed,
};

const taka = (paisa: number) => `৳${(paisa / 100).toLocaleString('en-IN')}`;

@Injectable()
export class OrderMessagesService {
  private readonly log = new Logger('OrderMessages');

  constructor(
    private readonly prisma: PrismaService,
    private readonly wa: WhatsAppCloudService,
    private readonly settings: MessagingSettingsService,
  ) {}

  /* ═══════════════ queue ═══════════════ */

  /**
   * একটা বার্তা সারিতে তোলা। ইতিমধ্যে থাকলে চুপচাপ কিছু করে না —
   * `@@unique([orderId, kind, attempt])` ডেটাবেজেই না বলে দেয়, তাই এখানে
   * "আগে দেখে নিই আছে কিনা" জাতীয় দৌড় (race) হয় না।
   */
  async queue(
    orderId: string,
    kind: OrderMessageKind,
    opts: { attempt?: number; dueAt?: Date } = {},
  ) {
    const attempt = opts.attempt ?? 1;
    try {
      return await this.prisma.db.orderMessage.create({
        data: {
          orderId,
          kind,
          attempt,
          dueAt: opts.dueAt ?? new Date(),
          templateName: TEMPLATE_FOR[kind],
          status: OrderMessageStatus.QUEUED,
        },
      });
    } catch (e) {
      // unique লঙ্ঘন = আগেই সারিতে আছে। এটাই কাঙ্ক্ষিত, ভুল নয়।
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null;
      this.log.warn(`queue failed ${kind} for ${orderId}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  /**
   * order তৈরি হওয়ার সাথে সাথে। COD আর prepaid-এর বার্তা আলাদা
   * (DEC-WA-005) — COD-তে "আমাদের একজন প্রতিনিধি যোগাযোগ করে verify
   * করবেন" বলা হয়, কারণ ওখানে টাকা এখনো আসেনি এবং ভুয়া order-ও থাকে।
   */
  async queueConfirmation(orderId: string, isCod: boolean) {
    return this.queue(
      orderId,
      isCod ? OrderMessageKind.ORDER_CONFIRMATION_COD : OrderMessageKind.ORDER_CONFIRMATION,
    );
  }

  /**
   * পেমেন্ট ফেল/বাতিল (DEC-WA-002) — এখন একবার, আর কয়েক ঘণ্টা পর আরেকবার।
   * দ্বিতীয়টা এখনই সারিতে তোলা হয় ভবিষ্যতের `dueAt` দিয়ে; টাকা এসে গেলে
   * পাঠানোর আগে সেটা `SKIPPED` হয়ে যাবে (`sendOne`-এর যাচাই)।
   */
  async queuePaymentFailed(orderId: string) {
    const s = await this.settings.get();
    if (!s.recoveryEnabled || !s.paymentFailedEnabled) return;

    await this.queue(orderId, OrderMessageKind.PAYMENT_FAILED, { attempt: 1 });

    if (s.paymentFailedRetryHours > 0) {
      const dueAt = new Date(Date.now() + s.paymentFailedRetryHours * 3600_000);
      await this.queue(orderId, OrderMessageKind.PAYMENT_FAILED, { attempt: 2, dueAt });
    }
  }

  /* ═══════════════ send ═══════════════ */

  /** সময় হয়ে যাওয়া সব সারি পাঠায়। sweeper আর "হাতে চালান" বোতাম দুটোই এটাই ডাকে। */
  async sendDue(limit = 50) {
    const due = await this.prisma.db.orderMessage.findMany({
      where: { status: OrderMessageStatus.QUEUED, dueAt: { lte: new Date() }, deletedAt: null },
      orderBy: { dueAt: 'asc' },
      take: limit,
      include: { order: true },
    });

    let sent = 0, failed = 0, skipped = 0;
    for (const m of due) {
      const r = await this.sendOne(m.id);
      if (r === 'SENT') sent++;
      else if (r === 'SKIPPED') skipped++;
      else failed++;
    }
    return { picked: due.length, sent, failed, skipped };
  }

  /** একটা সারি পাঠায় — বা কারণসহ বাদ দেয় */
  async sendOne(id: string): Promise<'SENT' | 'FAILED' | 'SKIPPED'> {
    const m = await this.prisma.db.orderMessage.findFirst({
      where: { id, deletedAt: null },
      include: { order: true },
    });
    if (!m || m.status !== OrderMessageStatus.QUEUED) return 'SKIPPED';

    const o = m.order;

    /*  বাদ দেওয়ার কারণগুলো — প্রতিটাই "পাঠানোর দরকার ফুরিয়ে গেছে", ব্যর্থতা
        নয়। তাই SKIPPED, আর কারণটা `error` ঘরে মানুষের ভাষায় লেখা থাকে।  */
    const skip = await this.skipReason(m.kind, o);
    if (skip) {
      await this.prisma.db.orderMessage.update({
        where: { id },
        data: { status: OrderMessageStatus.SKIPPED, error: skip },
      });
      return 'SKIPPED';
    }

    let payload: Record<string, unknown>;
    try {
      payload = this.payloadFor(m.kind, o, await this.settings.supportPhone());
    } catch (e) {
      await this.prisma.db.orderMessage.update({
        where: { id },
        data: { status: OrderMessageStatus.FAILED, error: (e as Error).message.slice(0, 500) },
      });
      return 'FAILED';
    }
    const r = await this.wa.sendRaw(o.senderPhone, payload);

    await this.prisma.db.orderMessage.update({
      where: { id },
      data: r.ok
        ? { status: OrderMessageStatus.SENT, sentAt: new Date(), providerMessageId: r.messageId ?? null, error: null }
        : !r.configured
          ? { status: OrderMessageStatus.SKIPPED, error: 'WhatsApp is not connected' }
          : { status: OrderMessageStatus.FAILED, error: (r.error ?? 'unknown').slice(0, 500) },
    });

    return r.ok ? 'SENT' : r.configured ? 'FAILED' : 'SKIPPED';
  }

  /** পাঠানোর মুহূর্তে যাচাই — সারি তোলার সময়ের অবস্থা ততক্ষণে বদলে যেতে পারে */
  private async skipReason(
    kind: OrderMessageKind,
    o: { id: string; senderPhone: string; salesStatus: string; paymentStatus: string; deletedAt: Date | null },
  ): Promise<string | null> {
    if (o.deletedAt) return 'order deleted';
    if (!o.senderPhone?.trim()) return 'no phone on the order';
    if (o.salesStatus === 'cancelled') return 'order cancelled';

    /*  ⚠️ এটাই "টাকা এসে গেলে ২৪ ঘণ্টার তাগাদা যাবে না" নিয়মের বাস্তব রূপ
        (DEC-WA-002)। টাকা দিয়ে ফেলার পর "আপনার পেমেন্ট হয়নি" পাওয়া
        গ্রাহকের কাছে দোকানটাকে অবিশ্বাস্য করে তোলে।  */
    if (kind === OrderMessageKind.PAYMENT_FAILED && o.paymentStatus !== 'unpaid') {
      return 'already paid';
    }
    return null;
  }

  /** kind অনুযায়ী template + মান */
  private payloadFor(
    kind: OrderMessageKind,
    o: { orderNo: string; senderName: string; totalPaisa: number },
    supportPhone: string,
  ) {
    switch (kind) {
      case OrderMessageKind.ORDER_CONFIRMATION:
        return this.wa.template(TPL.confirm, [o.senderName, o.orderNo, taka(o.totalPaisa)]);
      case OrderMessageKind.ORDER_CONFIRMATION_COD:
        return this.wa.template(TPL.confirmCod, [o.senderName, o.orderNo, taka(o.totalPaisa)]);
      case OrderMessageKind.ORDER_OUT_FOR_DELIVERY:
        return this.wa.template(TPL.out, [o.orderNo]);
      case OrderMessageKind.ORDER_DELIVERED:
        return this.wa.template(TPL.delivered, [o.orderNo]);
      case OrderMessageKind.PAYMENT_FAILED:
        /*  বোতামে গোটা ঠিকানা নয়, শুধু শেষ টুকরো — Meta-র নিয়ম। template-এ
            লেখা থাকে `https://radian.com.bd/pay/{{1}}`, আমরা দিই order নম্বর।  */
        return this.wa.template(
          TPL.paymentFailed,
          [o.senderName, o.orderNo, taka(o.totalPaisa), supportPhone],
          'en',
          o.orderNo,
        );
      default:
        /*  enum-এ নতুন kind যোগ হলে এখানে এসে পড়বে। চুপচাপ `undefined`
            ফেরত দিয়ে পরে "বার্তা যাচ্ছে না কেন" খোঁজার চেয়ে এখানেই থেমে
            যাওয়া ভালো — sendOne এটাকে FAILED হিসেবে লিখে রাখবে।  */
        throw new Error(`no template mapped for ${String(kind)}`);
    }
  }
}
