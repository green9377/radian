import { Injectable } from '@nestjs/common';
import { CheckoutLeadStatus, PaymentSessionStatus, Prisma, RecoveryOutcome, SalesStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingSettingsService } from './messaging-settings.service';

/*
  Orders -> Lost orders (owner, 9 Sep 2026): everyone who started to buy and
  did not finish, on ONE list.

  Three sources, three owners, nothing copied:
    - CheckoutLead   (Messaging)  - typed something at checkout and left
    - PaymentSession (Sales)      - pressed Place Order; the gateway failed or was cancelled
    - Order          (Sales)      - placed, online, unpaid; gateway opened and the tab closed
  Plus RecoveryFollowUp, which is the only thing this screen WRITES: what staff
  did about a row (called, no answer, will pay, not interested, ordered, closed).

  A row's state is decided here, once, from those four tables. The admin draws;
  it never counts.
*/

export type LostKind = 'LEFT' | 'FAILED' | 'CANCELLED' | 'UNPAID';
export type LostBucket = 'OPEN' | 'RECOVERED' | 'CLOSED';

export interface LostRow {
  key: string;
  kind: LostKind;
  bucket: LostBucket;
  /** "Checkout" for a lead, the order number for an order */
  ref: string;
  leadId: string | null;
  orderId: string | null;
  orderNo: string | null;
  lastSeenAt: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  isGift: boolean;
  recipientName: string | null;
  recipientPhone: string | null;
  address: string | null;
  /** everything else the customer typed (leads) — already scrubbed of card-shaped fields */
  draft: Record<string, unknown> | null;
  stage: 'CART' | 'DETAILS' | 'DELIVERY' | 'PAYMENT' | 'PLACED';
  itemCount: number;
  cartSummary: { name?: string; qty?: number; size?: string; variant?: string }[];
  totalPaisa: number;
  /** why it stopped, in words a person can read out on the phone */
  reason: string;
  /** the lead's own message record */
  messaged: boolean;
  lastOutcome: { outcome: RecoveryOutcome; note: string | null; actor: string; at: string } | null;
}

const OPEN_OUTCOMES: RecoveryOutcome[] = [RecoveryOutcome.CALLED, RecoveryOutcome.NO_ANSWER, RecoveryOutcome.WILL_PAY];

function bucketOf(latest: RecoveryOutcome | undefined, recoveredByItself: boolean): LostBucket {
  if (recoveredByItself || latest === RecoveryOutcome.ORDERED) return 'RECOVERED';
  if (latest === RecoveryOutcome.NOT_INTERESTED || latest === RecoveryOutcome.CLOSED) return 'CLOSED';
  return 'OPEN';
}

@Injectable()
export class LostOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: MessagingSettingsService,
  ) {}

  async list(): Promise<{ rows: LostRow[]; stats: { open: number; atStakePaisa: number; recovered30: number; recovered30Paisa: number; messaged30: number } }> {
    const s = await this.settings.get();
    const now = Date.now();
    const since30 = new Date(now - 30 * 86_400_000);
    const unpaidCutoff = new Date(now - s.unpaidAfterMinutes * 60_000);

    const [leads, orders, followUps] = await Promise.all([
      this.prisma.db.checkoutLead.findMany({
        where: { deletedAt: null, status: { not: CheckoutLeadStatus.CONVERTED } },
        orderBy: { lastSeenAt: 'desc' },
        take: 500,
      }),
      this.prisma.db.order.findMany({
        where: {
          deletedAt: null,
          paymentMethod: 'online',
          paymentStatus: 'unpaid',
          salesStatus: { in: [SalesStatus.placed, SalesStatus.confirmed] },
        },
        include: {
          paySessions: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { lines: { where: { deletedAt: null } } } },
          lines: { where: { deletedAt: null }, select: { name: true, qty: true, sizeLabel: true, variantLabel: true }, take: 6 },
        },
        orderBy: { placedAt: 'desc' },
        take: 500,
      }),
      this.prisma.db.recoveryFollowUp.findMany({ orderBy: { createdAt: 'desc' } }),
    ]);

    // latest follow-up per lead / order
    const latestByLead = new Map<string, (typeof followUps)[number]>();
    const latestByOrder = new Map<string, (typeof followUps)[number]>();
    for (const f of followUps) {
      if (f.leadId && !latestByLead.has(f.leadId)) latestByLead.set(f.leadId, f);
      if (f.orderId && !latestByOrder.has(f.orderId)) latestByOrder.set(f.orderId, f);
    }
    const outcomeOf = (f?: (typeof followUps)[number]) =>
      f ? { outcome: f.outcome, note: f.note, actor: f.actor, at: f.createdAt.toISOString() } : null;

    const rows: LostRow[] = [];

    for (const l of leads) {
      const draft = (l.draft ?? null) as Record<string, unknown> | null;
      const cart = (l.cart ?? null) as { summary?: LostRow['cartSummary'] } | null;
      const f = latestByLead.get(l.id);
      const stageWord = l.stage === 'CART' ? 'the cart' : l.stage === 'DETAILS' ? 'Details' : l.stage === 'DELIVERY' ? 'Delivery' : 'Payment';
      rows.push({
        key: `lead:${l.id}`,
        kind: 'LEFT',
        bucket: bucketOf(f?.outcome, false),
        ref: 'Checkout',
        leadId: l.id,
        orderId: null,
        orderNo: null,
        lastSeenAt: l.lastSeenAt.toISOString(),
        name: l.name,
        phone: l.phone,
        email: l.email,
        isGift: draft?.isGift === true,
        recipientName: typeof draft?.recipientName === 'string' ? (draft.recipientName as string) : null,
        recipientPhone: typeof draft?.recipientPhone === 'string' ? (draft.recipientPhone as string) : null,
        address: typeof draft?.address === 'string' ? (draft.address as string) : null,
        draft,
        stage: l.stage,
        itemCount: l.itemCount,
        cartSummary: cart?.summary ?? [],
        totalPaisa: l.totalPaisa,
        reason: `stopped at ${stageWord}${l.skipReason ? ` · ${l.skipReason}` : ''}`,
        messaged: l.status === CheckoutLeadStatus.MESSAGED,
        lastOutcome: outcomeOf(f),
      });
    }

    for (const o of orders) {
      const ps = o.paySessions[0];
      let kind: LostKind;
      let reason: string;
      if (ps?.status === PaymentSessionStatus.FAILED) {
        kind = 'FAILED';
        const raw = (ps.raw ?? {}) as Record<string, unknown>;
        const why = [raw.failedreason, raw.error, raw.reason].find((v) => typeof v === 'string' && v) as string | undefined;
        reason = why ? `gateway: ${why}` : 'the gateway returned a failure';
      } else if (ps?.status === PaymentSessionStatus.CANCELLED) {
        kind = 'CANCELLED';
        reason = 'pressed Cancel on the gateway';
      } else if (ps?.status === PaymentSessionStatus.INITIATED) {
        // still on the gateway page — not lost yet
        if (ps.createdAt > unpaidCutoff) continue;
        kind = 'UNPAID';
        reason = `gateway opened, no answer after ${s.unpaidAfterMinutes} min`;
      } else {
        kind = 'UNPAID';
        reason = 'never reached the gateway';
      }
      const f = latestByOrder.get(o.id);
      rows.push({
        key: `order:${o.id}`,
        kind,
        bucket: bucketOf(f?.outcome, false),
        ref: o.orderNo,
        leadId: null,
        orderId: o.id,
        orderNo: o.orderNo,
        lastSeenAt: (ps?.updatedAt ?? o.placedAt).toISOString(),
        name: o.senderName,
        phone: o.senderPhone,
        email: o.senderEmail,
        isGift: o.isGift,
        recipientName: o.recipientName,
        recipientPhone: o.recipientPhone,
        address: o.address,
        draft: null,
        stage: 'PLACED',
        itemCount: o._count.lines,
        cartSummary: o.lines.map((ln) => ({ name: ln.name, qty: ln.qty, size: ln.sizeLabel ?? undefined, variant: ln.variantLabel ?? undefined })),
        totalPaisa: o.totalPaisa,
        reason,
        messaged: false,
        lastOutcome: outcomeOf(f),
      });
    }

    // Recovered by itself: a lead that turned into an order in the last 30 days,
    // and an order that had a failed/cancelled attempt and was paid since.
    const [convertedLeads, paidAfterFail, messaged30, failedMsgs30] = await Promise.all([
      this.prisma.db.checkoutLead.findMany({
        where: { deletedAt: null, status: CheckoutLeadStatus.CONVERTED, lastSeenAt: { gte: since30 } },
        orderBy: { lastSeenAt: 'desc' },
        take: 200,
        include: { order: { select: { id: true, orderNo: true, totalPaisa: true, senderName: true, senderPhone: true, address: true, isGift: true, placedAt: true } } },
      }),
      this.prisma.db.order.findMany({
        where: {
          deletedAt: null,
          paymentMethod: 'online',
          paymentStatus: { in: ['paid', 'advance_paid'] },
          placedAt: { gte: since30 },
          paySessions: { some: { status: { in: [PaymentSessionStatus.FAILED, PaymentSessionStatus.CANCELLED] } } },
        },
        include: { paySessions: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 }, _count: { select: { lines: true } } },
        orderBy: { placedAt: 'desc' },
        take: 200,
      }),
      this.prisma.db.checkoutLead.count({ where: { deletedAt: null, messageSentAt: { gte: since30 } } }),
      this.prisma.db.orderMessage.count({ where: { deletedAt: null, kind: 'PAYMENT_FAILED', status: 'SENT', sentAt: { gte: since30 } } }),
    ]);

    for (const l of convertedLeads) {
      if (!l.order) continue;
      rows.push({
        key: `lead:${l.id}`,
        kind: 'LEFT',
        bucket: 'RECOVERED',
        ref: l.order.orderNo,
        leadId: l.id,
        orderId: l.order.id,
        orderNo: l.order.orderNo,
        lastSeenAt: l.order.placedAt.toISOString(),
        name: l.order.senderName,
        phone: l.order.senderPhone,
        email: l.email,
        isGift: l.order.isGift,
        recipientName: null,
        recipientPhone: null,
        address: l.order.address,
        draft: null,
        stage: 'PLACED',
        itemCount: l.itemCount,
        cartSummary: [],
        totalPaisa: l.order.totalPaisa,
        reason: 'came back and ordered',
        messaged: Boolean(l.messageSentAt),
        lastOutcome: outcomeOf(latestByLead.get(l.id)),
      });
    }
    for (const o of paidAfterFail) {
      if (rows.some((r) => r.orderId === o.id)) continue;
      rows.push({
        key: `order:${o.id}`,
        kind: 'FAILED',
        bucket: 'RECOVERED',
        ref: o.orderNo,
        leadId: null,
        orderId: o.id,
        orderNo: o.orderNo,
        lastSeenAt: (o.paySessions[0]?.updatedAt ?? o.placedAt).toISOString(),
        name: o.senderName,
        phone: o.senderPhone,
        email: o.senderEmail,
        isGift: o.isGift,
        recipientName: o.recipientName,
        recipientPhone: o.recipientPhone,
        address: o.address,
        draft: null,
        stage: 'PLACED',
        itemCount: o._count.lines,
        cartSummary: [],
        totalPaisa: o.totalPaisa,
        reason: 'paid on a later attempt',
        messaged: false,
        lastOutcome: outcomeOf(latestByOrder.get(o.id)),
      });
    }

    rows.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));

    const open = rows.filter((r) => r.bucket === 'OPEN');
    const rec = rows.filter((r) => r.bucket === 'RECOVERED' && r.lastSeenAt >= since30.toISOString());
    return {
      rows,
      stats: {
        open: open.length,
        atStakePaisa: open.reduce((n, r) => n + r.totalPaisa, 0),
        recovered30: rec.length,
        recovered30Paisa: rec.reduce((n, r) => n + r.totalPaisa, 0),
        messaged30: messaged30 + failedMsgs30,
      },
    };
  }

  /** The "Handled" button. One row per touch; the newest is the state. */
  async handle(dto: { leadId?: string; orderId?: string; outcome: RecoveryOutcome; note?: string }, actor: string) {
    if (!dto.leadId && !dto.orderId) throw new Error('leadId or orderId is required');
    if (!Object.values(RecoveryOutcome).includes(dto.outcome)) throw new Error('unknown outcome');
    const data: Prisma.RecoveryFollowUpCreateInput = {
      leadId: dto.leadId ?? null,
      orderId: dto.orderId ?? null,
      outcome: dto.outcome,
      note: dto.note?.trim().slice(0, 500) || null,
      actor,
    };
    return this.prisma.db.recoveryFollowUp.create({ data });
  }

  /** every touch on one row, newest first */
  history(q: { leadId?: string; orderId?: string }) {
    return this.prisma.db.recoveryFollowUp.findMany({
      where: q.leadId ? { leadId: q.leadId } : { orderId: q.orderId ?? '' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

/* keeps OPEN_OUTCOMES referenced for readers of this file: those three keep a row open */
export const OPEN_OUTCOME_LIST = OPEN_OUTCOMES;
