import { Injectable, Logger } from '@nestjs/common';
import { OrderMessageKind, OrderMessageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TPL, WhatsAppCloudService } from '../common/whatsapp-cloud';
import { MessagingSettingsService } from './messaging-settings.service';

/*
  The only path for any message about an order.

  Every message is written as a row first and sent second. Sending first and
  recording after means a crash between the two sends it again on the next
  sweep; this way the worst case is a row not yet sent, which the sweep fixes.
  Nothing here can block an order — a message is a courtesy, the order is the
  contract.
*/

/** One place for the kind → template mapping. */
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

  /* ---- queue ---- */

  /**
   * Queues one message. Already queued is silently fine — the unique index on
   * (orderId, kind, attempt) refuses it, so there is no check-then-insert race.
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
      // Unique violation means it is already queued. That is the point.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null;
      this.log.warn(`queue failed ${kind} for ${orderId}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  /** COD and prepaid say different things: COD has no money yet. */
  async queueConfirmation(orderId: string, isCod: boolean) {
    return this.queue(
      orderId,
      isCod ? OrderMessageKind.ORDER_CONFIRMATION_COD : OrderMessageKind.ORDER_CONFIRMATION,
    );
  }

  /**
   * Queues the immediate message and, if configured, one for later. The later
   * one is skipped at send time if the money has arrived by then.
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

  /* ---- send ---- */

  /** Sends everything that is due. Both the sweeper and "Run now" call this. */
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

  /** Sends one row, or skips it with a reason. */
  async sendOne(id: string): Promise<'SENT' | 'FAILED' | 'SKIPPED'> {
    const m = await this.prisma.db.orderMessage.findFirst({
      where: { id, deletedAt: null },
      include: { order: true },
    });
    if (!m || m.status !== OrderMessageStatus.QUEUED) return 'SKIPPED';

    const o = m.order;

    // Skipping is not failure — the reason to send simply expired.
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

  /** Re-checked at send time: the world moves between queueing and sending. */
  private async skipReason(
    kind: OrderMessageKind,
    o: { id: string; senderPhone: string; salesStatus: string; paymentStatus: string; deletedAt: Date | null },
  ): Promise<string | null> {
    if (o.deletedAt) return 'order deleted';
    if (!o.senderPhone?.trim()) return 'no phone on the order';
    if (o.salesStatus === 'cancelled') return 'order cancelled';

    // Telling someone who has paid that they have not is worse than silence.
    if (kind === OrderMessageKind.PAYMENT_FAILED && o.paymentStatus !== 'unpaid') {
      return 'already paid';
    }
    return null;
  }

  /** Template and values for one kind. */
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
      // {{1}} is always the name, {{2}} the order number, in every template.
      case OrderMessageKind.ORDER_OUT_FOR_DELIVERY:
        return this.wa.template(TPL.out, [o.senderName, o.orderNo]);
      case OrderMessageKind.ORDER_DELIVERED:
        return this.wa.template(TPL.delivered, [o.senderName, o.orderNo]);
      case OrderMessageKind.PAYMENT_FAILED:
        // The button takes only the URL's last segment, not the whole address.
        return this.wa.template(
          TPL.paymentFailed,
          [o.senderName, o.orderNo, taka(o.totalPaisa), supportPhone],
          'en',
          o.orderNo,
        );
      default:
        // A new kind with no template lands here. Failing loudly beats silence.
        throw new Error(`no template mapped for ${String(kind)}`);
    }
  }
}
