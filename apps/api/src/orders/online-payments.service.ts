import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  ONLINE PAYMENTS — the answer to "I paid, but it says I still owe you".

  Until now that question had no screen. `PaymentSession` recorded every trip
  to the gateway, including the failed ones, and the only way to read it was
  SQL. So the shop's honest answer to a customer holding a bank SMS was "let
  me get back to you", and somebody had to open a database.

  ⚠️ THIS SERVICE ONLY READS. `PaymentSession` is written in one place —
  `shop/payment.ts`, where the gateway is called back and validated — and it
  stays that way. Orders looks at it through the foreign key, exactly as house
  rule 4 allows; a second writer would be a second story about whether money
  arrived.

  ⚠️ `raw` IS NOT SENT WHOLESALE. It is the gateway's entire payload: the
  customer's name, email, phone, address, risk scoring, our own store id. Staff
  already see the customer on the order, and the rest is nobody's business on a
  reconcile screen. Only the fields that answer the question are lifted out —
  what the gateway called it, why it refused, and what it says it kept.
  ═══════════════════════════════════════════════════════════════════════════
*/

/** what the reconcile screen needs about one trip to the gateway */
export interface OnlinePaymentRow {
  id: string;
  tranId: string;
  provider: string;
  status: string;
  amountPaisa: number;
  createdAt: Date;
  settledAt: Date | null;
  /** the gateway's own references — what SSLCommerz support asks for */
  valId: string | null;
  bankTranId: string | null;
  cardType: string | null;
  /** the gateway's verdict in its own words, and why it refused */
  gatewayStatus: string | null;
  gatewayReason: string | null;
  /** what the gateway said it would pass on, when it said (DEC-FIN-029) */
  storeAmountPaisa: number | null;
  order: { id: string; orderNo: string; totalPaisa: number; paidPaisa: number; refundPaisa: number } | null;
}

type RawShape = Record<string, unknown>;

@Injectable()
export class OnlinePaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lift the few useful fields out of the gateway's payload.
   *
   * Defensive on purpose: `raw` is whatever SSLCommerz sent, its shape is
   * theirs to change, and a reconcile screen that throws because a field moved
   * is a screen that is down exactly when it is needed.
   */
  private fromRaw(raw: unknown) {
    const r = (raw ?? {}) as RawShape;
    const str = (k: string) => {
      const v = r[k];
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    };
    const storeAmount = str('store_amount');
    const paisa = storeAmount === null ? null : Math.round(parseFloat(storeAmount) * 100);
    return {
      gatewayStatus: str('status'),
      /*  Three names for one thing across their endpoints — init answers with
          `failedreason`, validation with `error`, some callbacks with
          `error_reason`. Whichever arrived is the sentence a human needs.  */
      gatewayReason: str('failedreason') ?? str('error') ?? str('error_reason'),
      storeAmountPaisa: paisa !== null && Number.isFinite(paisa) ? paisa : null,
    };
  }

  private shape(s: {
    id: string;
    tranId: string;
    provider: string;
    status: string;
    amountPaisa: number;
    createdAt: Date;
    settledAt: Date | null;
    valId: string | null;
    bankTranId: string | null;
    cardType: string | null;
    raw: unknown;
    order?: { id: string; orderNo: string; totalPaisa: number; paidPaisa: number; refundPaisa: number } | null;
  }): OnlinePaymentRow {
    return {
      id: s.id,
      tranId: s.tranId,
      provider: s.provider,
      status: s.status,
      amountPaisa: s.amountPaisa,
      createdAt: s.createdAt,
      settledAt: s.settledAt,
      valId: s.valId,
      bankTranId: s.bankTranId,
      cardType: s.cardType,
      ...this.fromRaw(s.raw),
      order: s.order ?? null,
    };
  }

  private static ORDER_SELECT = {
    select: { id: true, orderNo: true, totalPaisa: true, paidPaisa: true, refundPaisa: true },
  };

  /** every trip to the gateway for one order, oldest first — it reads as a story */
  async forOrder(orderId: string): Promise<OnlinePaymentRow[]> {
    const rows = await this.prisma.db.paymentSession.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: { order: OnlinePaymentsService.ORDER_SELECT },
    });
    return rows.map((r) => this.shape(r));
  }

  /**
   * The board: every gateway attempt across the shop, newest first.
   *
   * `q` matches the things a person actually has in hand when they come
   * asking — an order number, the gateway's transaction id, or the bank's
   * reference off a customer's SMS.
   */
  async list(opts: { status?: string; q?: string; take?: number }): Promise<{
    rows: OnlinePaymentRow[];
    counts: Record<string, number>;
  }> {
    const status = (opts.status ?? '').trim().toUpperCase();
    const q = (opts.q ?? '').trim();

    const where: Record<string, unknown> = {};
    if (status && status !== 'ALL') where.status = status;
    if (q) {
      where.OR = [
        { tranId: { contains: q, mode: 'insensitive' } },
        { bankTranId: { contains: q, mode: 'insensitive' } },
        { valId: { contains: q, mode: 'insensitive' } },
        { order: { orderNo: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [rows, grouped] = await Promise.all([
      this.prisma.db.paymentSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(200, Math.max(1, opts.take ?? 100)),
        include: { order: OnlinePaymentsService.ORDER_SELECT },
      }),
      /*  Counted over EVERYTHING, not over the filtered page — the tabs have to
          say how many failures exist, not how many are on screen.  */
      this.prisma.db.paymentSession.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const counts: Record<string, number> = { ALL: 0 };
    for (const g of grouped) {
      counts[g.status] = g._count._all;
      counts.ALL += g._count._all;
    }
    return { rows: rows.map((r) => this.shape(r)), counts };
  }
}
