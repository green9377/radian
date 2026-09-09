import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  OrderMessageChannel,
  OrderMessageKind,
  OrderMessageStatus,
  PaymentSessionStatus,
  PaymentStatus,
  Prisma,
  SalesStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TPL, WhatsAppCloudService } from '../common/whatsapp-cloud';
import { routeFor } from '../common/notify-route';
import { MessagingService } from '../marketing/messaging.service';
import { MessagingSettingsService } from './messaging-settings.service';
import { MessageTemplatesService, type TemplateKind } from './message-templates.service';

/*
  The only path for any message about an order.

  Every message is written as a row first and sent second. Sending first and
  recording after means a crash between the two sends it again on the next
  sweep; this way the worst case is a row not yet sent, which the sweep fixes.
  Nothing here can block an order — a message is a courtesy, the order is the
  contract.

  WHICH DOOR (owner, 8 Sep 2026 — `common/notify-route.ts`): a Bangladeshi
  number gets SMS, a foreign number gets email when the order has one, and
  WhatsApp is the last resort. SMS and email carry the admin's own wording
  (`MessageTemplatesService`); WhatsApp keeps Meta's approved templates. A
  primary door that is not set up (switched off, no key) hands over to
  WhatsApp; a primary door that is set up and FAILS is recorded as failed and
  shows in the order's message log — it does not quietly fall back and cost
  a WhatsApp message.
*/

/** One place for the kind → template mapping. */
/*
  ⚠️ A kind with NO WhatsApp template is deliberate, not an oversight.

  WhatsApp only carries wording Meta has approved in advance, and the two kinds
  added on 9 Sep have none — they are new. SMS and email carry the admin's own
  words and need no approval, so those doors work today; the WhatsApp door is
  skipped for these kinds rather than failed, and starts working by itself the
  day a template with that name is approved.
*/
const TEMPLATE_FOR: Record<OrderMessageKind, string | null> = {
  ORDER_CONFIRMATION: TPL.confirm,
  ORDER_CONFIRMATION_COD: TPL.confirmCod,
  ORDER_APPROVED: null,
  PAYMENT_RECEIVED: null,
  ORDER_OUT_FOR_DELIVERY: TPL.out,
  ORDER_DELIVERED: TPL.delivered,
  PAYMENT_FAILED: TPL.paymentFailed,
  REVIEW_REQUEST: TPL.review,
};

/*  DEC-WEB-008 — the review request goes out this long after delivery. Not a
    setting yet: one number, one meaning. The flowers have been seen, the
    moment is still warm, and tomorrow's sweep is soon enough.  */
const REVIEW_REQUEST_DELAY_MS = 24 * 3600_000;

const taka = (paisa: number) => `৳${(paisa / 100).toLocaleString('en-IN')}`;
const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

@Injectable()
export class OrderMessagesService {
  private readonly log = new Logger('OrderMessages');

  constructor(
    private readonly prisma: PrismaService,
    private readonly wa: WhatsAppCloudService,
    private readonly settings: MessagingSettingsService,
    private readonly messaging: MessagingService,
    private readonly wording: MessageTemplatesService,
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
          templateName: TEMPLATE_FOR[kind] ?? kind,
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
   *
   * Returns the first row, or null when it was already queued or recovery is
   * switched off — so a caller sweeping many orders can count what it did.
   */
  async queuePaymentFailed(orderId: string) {
    const s = await this.settings.get();
    if (!s.recoveryEnabled || !s.paymentFailedEnabled) return null;

    /*  ═══ IT WAITS — owner, 9 Sep 2026: *"agula sob 30 minit porer kahini"* ══

        Pressing Cancel on the gateway used to fire this in the same second.
        But a customer who cancels because the OTP was slow, or because they
        wanted a different card, is usually back within minutes — and being
        told "your payment failed" while you are typing your card number reads
        as a shop that has already given up on you.

        So both roads now wait the same `unpaidAfterMinutes`: the one who
        pressed Cancel, and the one who closed the tab and produced no callback
        at all. If the money arrives in between, `skipReason` throws the
        message away unsent ("already paid"). Nothing is lost by waiting.  */
    const dueAt = new Date(Date.now() + Math.max(1, s.unpaidAfterMinutes) * 60_000);
    const first = await this.queue(orderId, OrderMessageKind.PAYMENT_FAILED, { attempt: 1, dueAt });

    if (s.paymentFailedRetryHours > 0) {
      const retryAt = new Date(dueAt.getTime() + s.paymentFailedRetryHours * 3600_000);
      await this.queue(orderId, OrderMessageKind.PAYMENT_FAILED, { attempt: 2, dueAt: retryAt });
    }
    return first;
  }

  /**
   * The customer who simply closed the gateway tab (owner, 9 Sep 2026).
   *
   * SSLCommerz calls us back on a success, on a failure, and when the Cancel
   * button is pressed. A closed tab produces NOTHING — so the commonest way to
   * walk away from a payment was the one way the shop never heard about, and
   * that customer got neither a message nor a chance to finish.
   *
   * The wait itself lives in `queuePaymentFailed` now, so this sweep and the
   * gateway's own Cancel callback are governed by exactly one number.
   *
   * ⚠️ THIS DELIBERATELY DOES NOT TOUCH THE PAYMENT SESSION. Marking the
   * attempt FAILED would make `settle()` refuse the payment if it lands a
   * minute later — gateways are slow, and turning away real money to be tidy
   * is far worse than a message that arrives early. The attempt stays open;
   * only the recovery message is queued, and `skipReason` throws it away at
   * send time if the money has arrived by then ("already paid").
   *
   * The unique index does the rest: an order that already has a PAYMENT_FAILED
   * row cannot get a second one, so a later real Cancel callback is silent.
   */
  async sweepUnpaidPayments() {
    const s = await this.settings.get();
    if (!s.recoveryEnabled || !s.paymentFailedEnabled) return { picked: 0, queued: 0 };

    const minutes = Math.max(1, s.unpaidAfterMinutes);
    const cutoff = new Date(Date.now() - minutes * 60_000);
    /*  ⚠️ AND NOT OLDER THAN A DAY. This sweep is for the customer who walked
        away minutes ago, not for the shop's back catalogue of unpaid orders.
        Without a floor, the first run after switching recovery on would text
        everyone who ever abandoned a payment — about orders they have long
        forgotten — and that is a shop that looks like it spams.  */
    const floor = new Date(Date.now() - 24 * 3600_000);

    const stale = await this.prisma.db.paymentSession.findMany({
      where: {
        status: PaymentSessionStatus.INITIATED,
        createdAt: { gte: floor, lte: cutoff },
        deletedAt: null,
        /*  Still owing, still a live order. A part-paid or cancelled order has
            nothing to recover, and telling either of those that their payment
            failed is worse than silence.  */
        order: {
          paymentStatus: PaymentStatus.unpaid,
          salesStatus: { not: SalesStatus.cancelled },
          deletedAt: null,
        },
      },
      select: { orderId: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    let queued = 0;
    for (const orderId of new Set(stale.map((x) => x.orderId))) {
      if (await this.queuePaymentFailed(orderId)) queued++;
    }
    return { picked: stale.length, queued };
  }

  /**
   * DEC-WEB-008 — one invite per delivered order, due 24h later.
   *
   * The token IS the identity: the form it opens already knows the customer,
   * the order and the product, so a review born from it is Verified by
   * construction. The invite pre-selects the order's most expensive line —
   * the centrepiece is what the customer will have an opinion about.
   *
   * Both writes are idempotent: an existing invite for the order short-
   * circuits, and the OrderMessage unique index refuses a second queue row.
   */
  async queueReviewRequest(orderId: string) {
    /*  DEC-WEB-012 (owner, 6 Sep 2026) — one invite per PRODUCT on the
        delivered order, not one per order: a customer may review only what
        they bought, each thing on its own. The WhatsApp message carries the
        centrepiece's link; the account's order page offers every line's.
        Idempotent: a product that already has an invite on this order is
        left alone.  */
    const o = await this.prisma.db.order.findFirst({
      where: { id: orderId },
      select: {
        customerId: true,
        lines: { select: { productId: true, unitPaisa: true, qty: true } },
        reviewInvites: { select: { productId: true } },
      },
    });
    if (!o) return null;
    const have = new Set(o.reviewInvites.map((i) => i.productId));
    const byValue = [...o.lines].sort((a, b) => b.unitPaisa * b.qty - a.unitPaisa * a.qty);
    const products = [...new Set(byValue.map((l) => l.productId).filter((id): id is string => Boolean(id)))];
    for (const productId of products) {
      if (have.has(productId)) continue;
      await this.prisma.db.reviewInvite.create({
        data: {
          token: randomBytes(16).toString('hex'),
          orderId,
          customerId: o.customerId,
          productId,
          dueAt: new Date(Date.now() + REVIEW_REQUEST_DELAY_MS),
        },
      });
    }
    return this.queue(orderId, OrderMessageKind.REVIEW_REQUEST, {
      dueAt: new Date(Date.now() + REVIEW_REQUEST_DELAY_MS),
    });
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

    /*  DEC-WEB-008 — the review request carries a single-use link. The token
        lives on ReviewInvite, not on this row: the message is a courtesy, the
        invite is the contract. No invite or an already-used one = nothing to
        ask, so the message is skipped, not failed.  */
    let invite: { token: string; productName: string | null } | undefined;
    if (m.kind === OrderMessageKind.REVIEW_REQUEST) {
      const inv = await this.prisma.db.reviewInvite.findFirst({
        where: { orderId: o.id, usedAt: null },
        orderBy: { createdAt: 'asc' }, // the centrepiece was created first
        include: { product: { select: { name: true } } },
      });
      if (!inv) {
        await this.prisma.db.orderMessage.update({
          where: { id },
          data: { status: OrderMessageStatus.SKIPPED, error: 'no open review invite for this order' },
        });
        return 'SKIPPED';
      }
      invite = { token: inv.token, productName: inv.product?.name ?? null };
    }

    const supportPhone = await this.settings.supportPhone();

    /*  The door, in the owner's order. A door that is not set up passes to
        the next; a door that is set up and fails stops here, as FAILED.  */
    const doors = routeFor(o.senderPhone, o.senderEmail);
    let outcome: { ok: boolean; configured: boolean; error?: string; messageId?: string } = {
      ok: false, configured: false, error: 'no channel could take this message',
    };
    let usedChannel: OrderMessageChannel = OrderMessageChannel.WHATSAPP;
    for (const door of doors) {
      usedChannel = door;
      if (door === 'WHATSAPP') {
        /*  No Meta template for this kind — the door is "not set up" for this
            message, which lets the next one try instead of failing here.  */
        if (!TEMPLATE_FOR[m.kind]) {
          outcome = { ok: false, configured: false, error: 'no WhatsApp template for this kind' };
          continue;
        }
        let payload: Record<string, unknown>;
        try {
          payload = this.payloadFor(m.kind, o, supportPhone, invite);
        } catch (e) {
          await this.prisma.db.orderMessage.update({
            where: { id },
            data: { status: OrderMessageStatus.FAILED, channel: door, error: (e as Error).message.slice(0, 500) },
          });
          return 'FAILED';
        }
        const r = await this.wa.sendRaw(o.senderPhone, payload, {
          origin: 'order-message',
          /*  The kind is the repeat guard's key: the same order confirmation must
              not go twice, but a confirmation and a delivered notice are different
              messages to the same person and both should arrive.  */
          kind: `order:${m.kind}`,
        });
        outcome = { ok: r.ok, configured: r.configured, error: r.error, messageId: r.messageId ?? undefined };
      } else {
        outcome = await this.sendWorded(door, m.kind, o, supportPhone, invite);
      }
      if (outcome.ok || outcome.configured) break;
    }
    const r = outcome;

    await this.prisma.db.orderMessage.update({
      where: { id },
      data: r.ok
        ? { status: OrderMessageStatus.SENT, channel: usedChannel, sentAt: new Date(), providerMessageId: r.messageId ?? null, error: null }
        : !r.configured
          ? { status: OrderMessageStatus.SKIPPED, channel: usedChannel, error: r.error ?? 'no channel is set up' }
          : { status: OrderMessageStatus.FAILED, channel: usedChannel, error: (r.error ?? 'unknown').slice(0, 500) },
    });

    if (r.ok && invite) {
      await this.prisma.db.reviewInvite.updateMany({
        where: { orderId: o.id, usedAt: null },
        data: { sentAt: new Date() },
      });
    }

    return r.ok ? 'SENT' : r.configured ? 'FAILED' : 'SKIPPED';
  }

  /** Re-checked at send time: the world moves between queueing and sending. */
  private async skipReason(
    kind: OrderMessageKind,
    o: {
      id: string; senderPhone: string; salesStatus: string; paymentStatus: string;
      totalPaisa: number; paidPaisa: number; refundPaisa: number; deletedAt: Date | null;
    },
  ): Promise<string | null> {
    if (o.deletedAt) return 'order deleted';
    if (!o.senderPhone?.trim()) return 'no phone on the order';
    if (o.salesStatus === 'cancelled') return 'order cancelled';

    // Telling someone who has paid that they have not is worse than silence.
    if (kind === OrderMessageKind.PAYMENT_FAILED && o.paymentStatus !== 'unpaid') {
      return 'already paid';
    }
    /*  "৳3,000 received, ৳2,000 still due" is wrong the moment the rest
        arrives — and between queueing and sending it often does.  */
    if (
      kind === OrderMessageKind.PAYMENT_RECEIVED &&
      Math.max(0, o.paidPaisa - o.refundPaisa) >= o.totalPaisa
    ) {
      return 'nothing is owed any more';
    }
    return null;
  }

  /**
   * SMS or email, in the admin's words. `configured: false` means the door is
   * not set up (switched off, no key, no wording) and the next door may try;
   * `configured: true, ok: false` means it is set up and the send failed.
   */
  private async sendWorded(
    channel: OrderMessageChannel,
    kind: OrderMessageKind,
    o: {
      id: string; orderNo: string; senderName: string; senderPhone: string;
      senderEmail: string | null; totalPaisa: number; paidPaisa: number; refundPaisa: number;
    },
    supportPhone: string,
    invite?: { token: string; productName: string | null },
  ): Promise<{ ok: boolean; configured: boolean; error?: string; messageId?: string }> {
    const tpl = await this.wording.pick(kind as TemplateKind, channel);
    if (!tpl) return { ok: false, configured: false, error: `no ${channel} wording for ${kind} (Admin → Email & SMS → Templates)` };

    const shop = await this.shopName();
    const base = (process.env.PUBLIC_WEB_URL ?? '').replace(/\/$/, '');
    const link =
      kind === OrderMessageKind.REVIEW_REQUEST && invite
        ? `${base}/review/${invite.token}`
        : kind === OrderMessageKind.PAYMENT_FAILED
          ? `${base}/pay/${o.orderNo}`
          : `${base}/track?id=${encodeURIComponent(o.orderNo)}`;
    /*  What has actually been collected, and what is left — read at SEND time
        from the order itself, not stored on the message. A second payment
        landing while this one waits in the queue must not send a stale
        figure.  */
    const settled = Math.max(0, o.paidPaisa - o.refundPaisa);
    const vars = {
      name: o.senderName,
      order: o.orderNo,
      total: taka(o.totalPaisa),
      paid: taka(settled),
      due: taka(Math.max(0, o.totalPaisa - settled)),
      link,
      product: invite?.productName ?? 'your order',
      shop,
      phone: supportPhone,
    };
    const body = this.wording.render(tpl.body, vars);

    try {
      if (channel === OrderMessageChannel.SMS) {
        const r = await this.messaging.sendSms({ to: o.senderPhone, text: body, origin: 'order-message', kind: `order:${kind}` });
        return { ok: r.ok, configured: true, error: r.ok ? undefined : r.error, messageId: r.providerRef ?? undefined };
      }
      if (!o.senderEmail) return { ok: false, configured: false, error: 'no email on the order' };
      const r = await this.messaging.sendEmail({
        to: o.senderEmail,
        subject: this.wording.render(tpl.subject ?? `${shop} — ${o.orderNo}`, vars),
        html: `<div style="font:15px/1.6 system-ui,sans-serif;color:#222;white-space:pre-wrap">${escapeHtml(body)}</div>`,
        origin: 'order-message',
        kind: `order:${kind}`,
      });
      return { ok: r.ok, configured: true, error: r.ok ? undefined : r.error, messageId: r.providerRef ?? undefined };
    } catch (e) {
      /*  "SMS is switched off" / "No SMS key" / "Email is switched off" are
          thrown, not returned — that door is not set up, and the next may try.  */
      return { ok: false, configured: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private async shopName(): Promise<string> {
    try {
      const c = await this.prisma.db.companySetting.findFirst({ select: { tradeName: true, legalName: true } });
      return c?.tradeName?.trim() || c?.legalName?.trim() || 'Radian';
    } catch {
      return 'Radian';
    }
  }

  /** Template and values for one kind. */
  private payloadFor(
    kind: OrderMessageKind,
    o: { orderNo: string; senderName: string; totalPaisa: number },
    supportPhone: string,
    invite?: { token: string; productName: string | null },
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
      case OrderMessageKind.REVIEW_REQUEST: {
        // {{1}} name, {{2}} what they bought; the button opens /review/{token}
        if (!invite) throw new Error('review request without an invite');
        return this.wa.template(
          TPL.review,
          [o.senderName, invite.productName ?? 'your order'],
          'en',
          invite.token,
        );
      }
      default:
        /*  Only reachable if a kind gains a WhatsApp template name without a
            payload being written for it. Failing loudly beats silence.  */
        throw new Error(`no WhatsApp payload written for ${String(kind)}`);
    }
  }
}
