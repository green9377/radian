import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACC, ACC2, FinanceService } from './finance.service';
import type { LineInput, PostEntryInput } from './finance.dto';

/*  FINANCE EVENT CONSUMER — stage 2 of RADIAN_FINANCE_MODULE_ARCHITECTURE.md §4.

    This is the ONLY place operational events turn into ledger entries.

    DEC-FIN-010  fail-soft: a posting problem NEVER rolls back the sale, the
                 delivery or the purchase. It lands in FinancePostingFailure and
                 shows as a red badge that can be replayed.
    DEC-FIN-023  every post carries a sourceKey, so a replay or a double hook
                 can never double-count.
    One-way dependency: Orders/POS/Purchase/Returns/Inventory/Delivery call in
    here. Finance never calls them — it only READS their tables (constitution:
    "Finance owns nothing operational, it only reads and keeps the books").
*/

@Injectable()
export class FinanceEventsService {
  private readonly logger = new Logger(FinanceEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  /** every public method funnels through this: never throws, never blocks */
  private async safe(
    sourceType: PostEntryInput['sourceType'],
    sourceId: string,
    run: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await run();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`finance posting failed (${sourceType}:${sourceId}) — ${message}`);
      try {
        await this.prisma.db.financePostingFailure.create({
          data: {
            sourceType,
            sourceId,
            payload: { sourceType, sourceId } as Prisma.InputJsonValue,
            error: message.slice(0, 500),
          },
        });
      } catch {
        /* even the failure log failed — nothing more we can safely do */
      }
    }
  }

  private async enabled(): Promise<boolean> {
    const s = await this.finance.settings();
    if (!s?.autoPostEnabled) return false;
    // nothing before the go-live date belongs in the books (DEC-FIN-007)
    return true;
  }

  private async beforeGoLive(when: Date): Promise<boolean> {
    const s = await this.finance.settings();
    return !!s?.goLiveDate && when < s.goLiveDate;
  }

  private async accId(code: string): Promise<string> {
    const a = await this.prisma.db.financeAccount.findUnique({ where: { code } });
    if (!a) throw new Error(`Chart of accounts is missing ${code}`);
    return a.id;
  }

  /**
   * Map a PayMethod / PaymentMethod value onto the money account it lives in.
   *
   * DEC-GBL-006 — a shop can hold three bKash numbers, so the payment now says
   * WHICH account took it. When it does, that is the answer; the map below is
   * the fallback for older rows and for methods with a single account.
   */
  private async moneyAccountFor(
    method: string | null | undefined,
    accountId?: string | null,
  ): Promise<string> {
    if (accountId) {
      const acc = await this.prisma.db.financeAccount.findFirst({
        where: { id: accountId, isMoneyAccount: true },
        select: { id: true },
      });
      if (acc) return acc.id;
    }
    const m = (method ?? '').toUpperCase();
    const map: Record<string, string> = {
      CASH: ACC.CASH,
      COUNTER: ACC.CASH,
      COD: ACC.CASH,
      BKASH: ACC.BKASH,
      NAGAD: ACC.NAGAD,
      CARD: ACC.GATEWAY,
      ONLINE: ACC.GATEWAY,
      BANK: ACC.BANK,
      OTHER: ACC.WALLET,
    };
    return this.accId(map[m] ?? ACC.CASH);
  }

  /* ==================== SALES ==================== */

  /**
   * Stock left the warehouse for an order (DEC-MOD-003 preparing).
   * Value moves Inventory → Goods Out for Delivery. Profit is untouched
   * until the customer actually receives it (DEC-FIN-003).
   */
  async onOrderStockOut(orderId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('INVENTORY', orderId, async () => {
      const value = await this.saleMovementValue(orderId);
      if (value <= 0) return;
      await this.finance.postEntry({
        sourceType: 'INVENTORY',
        sourceId: orderId,
        sourceKey: `ORDER:${orderId}:stockout`,
        narration: 'Goods left the warehouse for an order',
        lines: [
          { accountId: await this.accId(ACC.GOODS_OUT), debitPaisa: value, orderId },
          { accountId: await this.accId(ACC.INVENTORY), creditPaisa: value },
        ],
      });
    });
  }

  /** the order was cancelled or the delivery failed and the goods came back */
  async onOrderStockReverted(orderId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('INVENTORY', orderId, async () => {
      const posted = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: `ORDER:${orderId}:stockout` },
        include: { lines: true },
      });
      if (!posted) return;
      const value = posted.lines.reduce((n, l) => n + l.debitPaisa, 0);
      if (value <= 0) return;
      await this.finance.postEntry({
        sourceType: 'INVENTORY',
        sourceId: orderId,
        sourceKey: `ORDER:${orderId}:stockback`,
        narration: 'Goods came back to the warehouse',
        lines: [
          { accountId: await this.accId(ACC.INVENTORY), debitPaisa: value },
          { accountId: await this.accId(ACC.GOODS_OUT), creditPaisa: value, orderId },
        ],
      });
    });
  }

  /**
   * The customer received the order — this is the moment a sale becomes real
   * (DEC-FIN-002). Revenue, VAT, delivery fee and the cost of the goods all
   * land together, so the month never shows income without its cost.
   */
  async onOrderDelivered(orderId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('ORDER', orderId, async () => {
      const o = await this.prisma.db.order.findUnique({
        where: { id: orderId },
        include: { transactions: true, channel: { select: { id: true } } },
      });
      if (!o || (await this.beforeGoLive(o.placedAt))) return;

      /* The split is built OUT OF the order total, never alongside it — Sales
         takes whatever is left after the named parts. Online and POS totals are
         calculated differently (POS adds VAT, online does not), so anything that
         assumes a formula eventually posts an unbalanced entry. */
      const total = o.totalPaisa;
      const delivery = Math.min(Math.max(0, o.deliveryPaisa - o.deliveryWaivedPaisa), Math.max(0, total));
      const base = o.subtotalPaisa - o.discountPaisa;
      const vatIsInTotal = o.vatPaisa > 0 && Math.abs(base + delivery + o.adjustmentPaisa + o.vatPaisa - total) <= 1;
      const vat = vatIsInTotal ? o.vatPaisa : 0;
      const adjustment = o.adjustmentPaisa; // may be negative (a give-away)

      const lines: LineInput[] = [
        { accountId: await this.accId(ACC.RECEIVABLE), debitPaisa: total, orderId },
      ];
      let remaining = total;
      if (delivery > 0) {
        lines.push({ accountId: await this.accId(ACC.DELIVERY_INCOME), creditPaisa: delivery, orderId });
        remaining -= delivery;
      }
      if (vat > 0) {
        lines.push({ accountId: await this.accId(ACC.VAT_PAYABLE), creditPaisa: vat, orderId });
        remaining -= vat;
      }
      if (adjustment !== 0) {
        lines.push(
          adjustment > 0
            ? { accountId: await this.accId(ACC.SALES_ADJUSTMENT), creditPaisa: adjustment, orderId }
            : { accountId: await this.accId(ACC.SALES_ADJUSTMENT), debitPaisa: -adjustment, orderId },
        );
        remaining -= adjustment;
      }
      if (remaining !== 0)
        lines.push({
          accountId: await this.accId(ACC.SALES),
          creditPaisa: remaining,
          orderId,
          zone: o.zone,
          channelId: o.channelId,
        });

      await this.finance.postEntry({
        sourceType: 'ORDER',
        sourceId: orderId,
        sourceKey: `ORDER:${orderId}:revenue`,
        entryDate: new Date(),
        narration: `${o.orderNo} delivered`,
        branchId: o.branchId,
        lines,
      });

      // the cost of what was sold — out of the holding account it went into at preparing
      const cost = await this.saleMovementValue(orderId);
      if (cost > 0) {
        const held = await this.prisma.db.journalEntry.findUnique({
          where: { sourceKey: `ORDER:${orderId}:stockout` },
        });
        await this.finance.postEntry({
          sourceType: 'ORDER',
          sourceId: orderId,
          sourceKey: `ORDER:${orderId}:cogs`,
          narration: `${o.orderNo} — cost of what was sold`,
          branchId: o.branchId,
          lines: [
            { accountId: await this.accId(ACC.COGS), debitPaisa: cost, orderId, zone: o.zone, channelId: o.channelId },
            {
              // POS and any order that never passed through preparing take it
              // straight out of stock
              accountId: await this.accId(held ? ACC.GOODS_OUT : ACC.INVENTORY),
              creditPaisa: cost,
              orderId,
            },
          ],
        });
      }

      // DEC-FIN-024 — mark the order as "in the books"; the drift checker and the
      // aging report both rely on this, and an edit after this point must raise
      // an adjusting entry rather than silently disagree with the ledger
      await this.prisma.db.order.update({
        where: { id: orderId },
        data: { financePostedAt: new Date() },
      });

      // money already taken before delivery was held as a liability — release
      // exactly that, nothing taken later (that clears the receivable directly)
      const advance = o.transactions
        .filter((t) => !t.deletedAt && (t.kind === 'ADVANCE' || t.kind === 'PAYMENT') && t.createdAt <= new Date())
        .reduce((n, t) => n + t.amountPaisa, 0);
      if (advance > 0)
        await this.finance.postEntry({
          sourceType: 'ORDER',
          sourceId: orderId,
          sourceKey: `ORDER:${orderId}:advance-release`,
          narration: `${o.orderNo} — money taken earlier applied to the sale`,
          lines: [
            { accountId: await this.accId(ACC.CUSTOMER_ADVANCE), debitPaisa: advance, orderId },
            { accountId: await this.accId(ACC.RECEIVABLE), creditPaisa: advance, orderId },
          ],
        });
    });
  }

  /** AVCO value of what left stock for this order (Inventory owns the number) */
  private async saleMovementValue(orderId: string): Promise<number> {
    const moves = await this.prisma.db.inventoryMovement.findMany({
      where: { refType: 'ORDER', refId: orderId, reason: 'SALE' },
      select: { valuePaisa: true },
    });
    return moves.reduce((n, m) => n + Math.abs(m.valuePaisa), 0);
  }

  /**
   * A payment row was written by Sales/POS. What it means depends on the kind:
   *   ADVANCE / PAYMENT  → money in, held as a liability until delivery
   *   COD_COLLECTED      → the carrier holds our cash, not us yet (DEC-FIN-021)
   *   REFUND             → money back out
   */
  async onPaymentRecorded(paymentId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('PAYMENT', paymentId, async () => {
      const p = await this.prisma.db.paymentTransaction.findUnique({
        where: { id: paymentId },
        include: { order: { select: { orderNo: true, fulfillmentType: true, branchId: true } } },
      });
      if (!p || p.deletedAt || p.amountPaisa === 0) return;
      if (await this.beforeGoLive(p.createdAt)) return;

      const money = await this.moneyAccountFor(p.method, (p as { accountId?: string | null }).accountId);
      const key = `PAYMENT:${p.id}:${p.kind}`;
      const counter = p.order?.orderNo ?? '';

      const stamp = () =>
        this.prisma.db.paymentTransaction.update({
          where: { id: p.id },
          data: { financePostedAt: new Date() },
        });

      if (p.kind === 'COD_COLLECTED') {
        // POS never has a carrier — the cash is in the drawer immediately
        const isCounter = p.order?.fulfillmentType === 'COUNTER';
        const landing = isCounter ? money : await this.accId(ACC.CASH_WITH_CARRIER);
        // remember WHO is holding it, so "who owes us cash" can be answered
        const assignment = isCounter
          ? null
          : await this.prisma.db.deliveryAssignment.findFirst({
              where: { orderId: p.orderId, isActive: true },
              select: { riderId: true, courierId: true },
            });
        await this.finance.postEntry({
          sourceType: 'PAYMENT',
          sourceId: p.id,
          sourceKey: key,
          entryDate: p.createdAt,
          narration: `${counter} — cash collected on delivery`,
          branchId: p.order?.branchId ?? null,
          carrierId: assignment?.riderId ?? assignment?.courierId ?? null,
          lines: [
            { accountId: landing, debitPaisa: p.amountPaisa, orderId: p.orderId },
            { accountId: await this.accId(ACC.RECEIVABLE), creditPaisa: p.amountPaisa, orderId: p.orderId },
          ],
        });
        await stamp();
        return;
      }

      if (p.kind === 'REFUND') {
        await this.finance.postEntry({
          sourceType: 'PAYMENT',
          sourceId: p.id,
          sourceKey: key,
          entryDate: p.createdAt,
          narration: `${counter} — refunded`,
          lines: [
            { accountId: await this.accId(ACC.SALES_RETURN), debitPaisa: p.amountPaisa, orderId: p.orderId },
            { accountId: money, creditPaisa: p.amountPaisa },
          ],
        });
        await stamp();
        return;
      }

      // ADVANCE / PAYMENT — money in. Before the sale is in the books it is a
      // liability (we owe flowers); once the revenue is posted the same money
      // simply clears what the customer owes. Without this split a payment taken
      // after delivery would sit in Customer Advance for ever.
      const already = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: `ORDER:${p.orderId}:revenue` },
        select: { id: true },
      });
      const landingAccount = already
        ? await this.accId(ACC.RECEIVABLE)
        : await this.accId(ACC.CUSTOMER_ADVANCE);

      /*
        ═══ DEC-FIN-029 — THE CUSTOMER PAID MORE THAN THE SHOP RECEIVED ═══

        A card payment of Tk 1,700 is not Tk 1,700 arriving anywhere. The
        gateway keeps its cut (2.5% on almost every channel, read from the
        SSLCommerz panel on 26 Aug 2026) and forwards Tk 1,657.50 — days later,
        and only once Tk 2,500 has piled up.

        The credit side is untouched: the customer's debt falls by the full
        Tk 1,700, because that is what they handed over. It is the DEBIT that
        splits — Tk 1,657.50 into the Gateway money account, which now holds
        exactly what SSLCommerz still owes the shop and can be checked against
        the panel's own "Unsettled Payable", and Tk 42.50 straight into the
        gateway fee expense on the day it was actually incurred.

        ⚠️ `feePaisa` is only ever what the gateway itself reported. Null means
        it did not say, and then nothing is split — a fee guessed from a rate
        would put a fabricated number in the books and, worse, make the Gateway
        balance look right while being wrong. A missing fee shows up as a gap
        at settlement and gets fixed by a human; an invented one never does.
      */
      const fee = (p as { feePaisa?: number | null }).feePaisa ?? 0;
      const feePaisa = fee > 0 && fee < p.amountPaisa ? fee : 0;
      const debits: LineInput[] = feePaisa
        ? [
            { accountId: money, debitPaisa: p.amountPaisa - feePaisa },
            { accountId: await this.accId(ACC.GATEWAY_FEE), debitPaisa: feePaisa, orderId: p.orderId },
          ]
        : [{ accountId: money, debitPaisa: p.amountPaisa }];

      await this.finance.postEntry({
        sourceType: 'PAYMENT',
        sourceId: p.id,
        sourceKey: key,
        entryDate: p.createdAt,
        narration: `${counter} — payment received`,
        branchId: p.order?.branchId ?? null,
        lines: [
          ...debits,
          { accountId: landingAccount, creditPaisa: p.amountPaisa, orderId: p.orderId },
        ],
      });
      await stamp();
    });
  }

  /* ==================== POS ==================== */

  /** counter sale — money and goods change hands in the same moment */
  async onPosSale(orderId: string): Promise<void> {
    // the money side arrives through onPaymentRecorded (split tenders), the
    // revenue + cost side is the same shape as a delivered order
    await this.onOrderDelivered(orderId);
  }

  /** day close — the drawer counted more or less than the books said */
  async onPosShiftClosed(shiftId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('POS_SHIFT', shiftId, async () => {
      const s = await this.prisma.db.posShift.findUnique({ where: { id: shiftId } });
      if (!s || !s.overShortPaisa) return;
      const cash = await this.accId(ACC.CASH);
      const diff = s.overShortPaisa; // counted − expected
      await this.finance.postEntry({
        sourceType: 'POS_SHIFT',
        sourceId: shiftId,
        sourceKey: `POS_SHIFT:${shiftId}:overshort`,
        entryDate: s.closedAt ?? new Date(),
        narration: `${s.shiftNo} day close — drawer ${diff < 0 ? 'short' : 'over'}`,
        lines:
          diff < 0
            ? [
                { accountId: await this.accId(ACC.CASH_SHORT), debitPaisa: -diff },
                { accountId: cash, creditPaisa: -diff },
              ]
            : [
                { accountId: cash, debitPaisa: diff },
                { accountId: await this.accId(ACC.CASH_OVER), creditPaisa: diff },
              ],
      });
    });
  }

  /* ==================== PURCHASE & SUPPLIER ==================== */

  /** goods received from a supplier — stock goes up, we owe them */
  async onPurchaseReceived(purchaseId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('PURCHASE', purchaseId, async () => {
      const p = await this.prisma.db.purchase.findUnique({ where: { id: purchaseId } });
      if (!p || p.deletedAt || p.grandTotalPaisa <= 0) return;
      if (await this.beforeGoLive(p.purchaseDate)) return;
      await this.finance.postEntry({
        sourceType: 'PURCHASE',
        sourceId: purchaseId,
        sourceKey: `PURCHASE:${purchaseId}:received`,
        entryDate: p.receivedAt ?? p.purchaseDate,
        narration: `${p.purchaseNo} received from ${p.supplierName}`,
        lines: [
          { accountId: await this.accId(ACC.INVENTORY), debitPaisa: p.grandTotalPaisa },
          { accountId: await this.accId(ACC.SUPPLIER_PAYABLE), creditPaisa: p.grandTotalPaisa },
        ],
      });
    });
  }

  /**
   * DEC-FIN-022 — a SupplierPayment is the ONLY source. The PurchasePayment rows
   * it creates through allocations must never be posted again.
   */
  async onSupplierPayment(supplierPaymentId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('SUPPLIER_PAYMENT', supplierPaymentId, async () => {
      const sp = await this.prisma.db.supplierPayment.findUnique({
        where: { id: supplierPaymentId },
        include: { supplier: { select: { name: true } } },
      });
      if (!sp || sp.deletedAt || sp.amountPaisa <= 0) return;
      if (await this.beforeGoLive(sp.paidAt)) return;
      await this.finance.postEntry({
        sourceType: 'SUPPLIER_PAYMENT',
        sourceId: sp.id,
        sourceKey: `SUPPLIER_PAYMENT:${sp.id}:paid`,
        entryDate: sp.paidAt,
        narration: `${sp.paymentNo} — paid ${sp.supplier?.name ?? 'supplier'}`,
        lines: [
          { accountId: await this.accId(ACC.SUPPLIER_PAYABLE), debitPaisa: sp.amountPaisa },
          {
            accountId: await this.moneyAccountFor(sp.method, (sp as { accountId?: string | null }).accountId),
            creditPaisa: sp.amountPaisa,
          },
        ],
      });
      await this.prisma.db.supplierPayment.update({
        where: { id: sp.id },
        data: { financePostedAt: new Date() },
      });
    });
  }

  /** a purchase payment made directly on a bill (not through a supplier payment) */
  async onPurchasePayment(purchasePaymentId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('PURCHASE', purchasePaymentId, async () => {
      const allocated = await this.prisma.db.supplierPaymentAllocation.findFirst({
        where: { purchasePaymentId },
      });
      if (allocated) return; // DEC-FIN-022 — already posted by the supplier payment
      const pp = await this.prisma.db.purchasePayment.findUnique({
        where: { id: purchasePaymentId },
      });
      if (!pp || pp.deletedAt || pp.amountPaisa <= 0) return;
      await this.finance.postEntry({
        sourceType: 'PURCHASE',
        sourceId: pp.id,
        sourceKey: `PURCHASE_PAYMENT:${pp.id}:paid`,
        entryDate: pp.paidAt,
        narration: 'Paid a supplier bill',
        lines: [
          { accountId: await this.accId(ACC.SUPPLIER_PAYABLE), debitPaisa: pp.amountPaisa },
          {
            accountId: await this.moneyAccountFor(pp.method, (pp as { accountId?: string | null }).accountId),
            creditPaisa: pp.amountPaisa,
          },
        ],
      });
    });
  }

  /* ==================== INVENTORY ==================== */

  /** wastage or a gift — stock leaves without a sale */
  async onStockIssue(issueId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('INVENTORY', issueId, async () => {
      const i = await this.prisma.db.stockIssue.findUnique({ where: { id: issueId } });
      if (!i || i.deletedAt || i.totalValuePaisa <= 0) return;
      if (await this.beforeGoLive(i.createdAt)) return;
      const expense = i.kind === 'WASTAGE' ? ACC.WASTAGE : ACC.GIFT;
      await this.finance.postEntry({
        sourceType: 'INVENTORY',
        sourceId: issueId,
        sourceKey: `ISSUE:${issueId}:${i.kind}`,
        entryDate: i.createdAt,
        narration: `${i.issueNo} — ${i.kind === 'WASTAGE' ? 'spoiled / damaged' : 'given away'}`,
        actorName: i.actor,
        lines: [
          { accountId: await this.accId(expense), debitPaisa: i.totalValuePaisa },
          { accountId: await this.accId(ACC.INVENTORY), creditPaisa: i.totalValuePaisa },
        ],
      });
      await this.prisma.db.stockIssue.update({
        where: { id: issueId },
        data: { financePostedAt: new Date() },
      });
    });
  }

  /** a stocktake found more or less than the books said */
  async onStockAdjustment(movementId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('INVENTORY', movementId, async () => {
      const m = await this.prisma.db.inventoryMovement.findUnique({ where: { id: movementId } });
      /*  P7-13 (31 Aug 2026) — OPENING belongs here too, and its absence is
          most of why the books said the shop held ৳7,919 of stock while the
          shelf held ৳107,381. Stock walks in through three doors: bought,
          counted, or already there on day one. Only "bought" ever reached the
          ledger, and this method — written, with account 5150 waiting — had
          not one caller.  */
      const handled = m?.reason === 'ADJUSTMENT' || m?.reason === 'OPENING';
      if (!m || !handled || m.valuePaisa === 0) return;
      const value = Math.abs(m.valuePaisa);
      const up = m.valuePaisa > 0;
      /*  DEC-INV-016 (owner, 31 Aug) — what a stocktake finds is a gain or a
          loss of this period (5150). What was already on the shelf when the
          books began is neither: it is where the shop started, so it faces
          equity, not the profit and loss.  */
      const other = await this.accId(
        m.reason === 'OPENING' ? ACC2.OPENING_EQUITY : ACC.INV_ADJUSTMENT,
      );
      const narration =
        m.reason === 'OPENING'
          ? 'Stock the shop already had when the books began'
          : up
            ? 'Stocktake found extra stock'
            : 'Stocktake found stock missing';
      await this.finance.postEntry({
        sourceType: 'INVENTORY',
        sourceId: movementId,
        sourceKey: `MOVEMENT:${movementId}:adjustment`,
        entryDate: m.createdAt,
        narration,
        actorName: m.actor,
        lines: up
          ? [
              { accountId: await this.accId(ACC.INVENTORY), debitPaisa: value, itemId: m.itemId },
              { accountId: other, creditPaisa: value },
            ]
          : [
              { accountId: other, debitPaisa: value },
              { accountId: await this.accId(ACC.INVENTORY), creditPaisa: value, itemId: m.itemId },
            ],
      });
    });
  }

  /**
   * P7-13 — bring the history in. Asked on 31 Aug whether to backfill or to
   * draw a line and start clean, the owner's answer was: go back and post it
   * all, so the books and the shelf finally agree.
   *
   * Every OPENING and ADJUSTMENT movement that carries value and was never
   * posted. Safe to run again: each entry is keyed by its movement
   * (`MOVEMENT:<id>:adjustment`, DEC-FIN-023), so a second run finds nothing
   * left to do rather than doubling anything.
   *
   * ⚠️ It deliberately does NOT touch WASTAGE, GIFT or the sale doors — those
   * already post through their own events, and this method exists precisely
   * because a door that posts twice is worse than one that never posted.
   */
  async backfillStockMovements(): Promise<{ found: number; posted: number; alreadyPosted: number }> {
    // 3300 Opening Balance is new (DEC-INV-016) — make sure the chart has it
    // before the first entry tries to face it
    await this.finance.ensureSeed();
    const rows = await this.prisma.db.inventoryMovement.findMany({
      where: { reason: { in: ['OPENING', 'ADJUSTMENT'] }, valuePaisa: { not: 0 } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    let posted = 0;
    let alreadyPosted = 0;
    for (const r of rows) {
      const seen = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: `MOVEMENT:${r.id}:adjustment` },
        select: { id: true },
      });
      if (seen) { alreadyPosted += 1; continue; }
      await this.onStockAdjustment(r.id);
      const now = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: `MOVEMENT:${r.id}:adjustment` },
        select: { id: true },
      });
      if (now) posted += 1;
    }
    return { found: rows.length, posted, alreadyPosted };
  }

  /* ==================== RETURNS ==================== */

  /**
   * A return was completed. The cash refund itself arrives as a REFUND payment
   * row; here we book the store credit (a liability, no money moved) and put
   * any restocked goods back at cost.
   */
  async onReturnCompleted(returnId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('RETURN', returnId, async () => {
      const r = await this.prisma.db.salesReturn.findUnique({
        where: { id: returnId },
        include: { order: { select: { orderNo: true } } },
      });
      if (!r || r.deletedAt) return;

      if (r.storeCreditPaisa > 0)
        await this.finance.postEntry({
          sourceType: 'RETURN',
          sourceId: returnId,
          sourceKey: `RETURN:${returnId}:store-credit`,
          entryDate: r.updatedAt,
          narration: `${r.returnNo} — store credit given instead of cash`,
          actorName: r.actorName,
          lines: [
            { accountId: await this.accId(ACC.SALES_RETURN), debitPaisa: r.storeCreditPaisa },
            { accountId: await this.accId(ACC.STORE_CREDIT), creditPaisa: r.storeCreditPaisa },
          ],
        });

      if (r.compensationPaisa > 0)
        await this.finance.postEntry({
          sourceType: 'RETURN',
          sourceId: returnId,
          sourceKey: `RETURN:${returnId}:compensation`,
          entryDate: r.updatedAt,
          narration: `${r.returnNo} — partial compensation`,
          actorName: r.actorName,
          lines: [
            { accountId: await this.accId(ACC.SALES_RETURN), debitPaisa: r.compensationPaisa },
            { accountId: await this.accId(ACC.CASH), creditPaisa: r.compensationPaisa },
          ],
        });

      // goods that came back into stock reduce the cost of sales again
      const back = await this.prisma.db.inventoryMovement.findMany({
        where: { refType: 'RETURN', refId: returnId, reason: 'SALE_RETURN' },
        select: { valuePaisa: true },
      });
      const restock = back.reduce((n, m) => n + Math.abs(m.valuePaisa), 0);
      if (restock > 0)
        await this.finance.postEntry({
          sourceType: 'RETURN',
          sourceId: returnId,
          sourceKey: `RETURN:${returnId}:restock`,
          entryDate: r.updatedAt,
          narration: `${r.returnNo} — goods back in stock`,
          lines: [
            { accountId: await this.accId(ACC.INVENTORY), debitPaisa: restock },
            { accountId: await this.accId(ACC.COGS), creditPaisa: restock },
          ],
        });
    });
  }

  /** a customer spent their store credit on a new order */
  async onStoreCreditUsed(creditId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('RETURN', creditId, async () => {
      const c = await this.prisma.db.customerCredit.findUnique({ where: { id: creditId } });
      if (!c || c.deletedAt || c.kind !== 'CONSUMED') return;
      const amount = Math.abs(c.amountPaisa);
      if (amount <= 0) return;
      await this.finance.postEntry({
        sourceType: 'RETURN',
        sourceId: creditId,
        sourceKey: `CREDIT:${creditId}:used`,
        entryDate: c.createdAt,
        narration: 'Store credit used on an order',
        actorName: c.actorName,
        lines: [
          { accountId: await this.accId(ACC.STORE_CREDIT), debitPaisa: amount },
          { accountId: await this.accId(ACC.RECEIVABLE), creditPaisa: amount },
        ],
      });
    });
  }

  /* ==================== DELIVERY ==================== */

  /** what we pay the rider or the courier for this parcel (F12) */
  async onDeliveryCost(assignmentId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('DELIVERY', assignmentId, async () => {
      const a = await this.prisma.db.deliveryAssignment.findUnique({ where: { id: assignmentId } });
      if (!a || a.deletedAt || a.costPaisa <= 0) return;
      await this.finance.postEntry({
        sourceType: 'DELIVERY',
        sourceId: assignmentId,
        sourceKey: `DELIVERY:${assignmentId}:cost`,
        entryDate: a.deliveredAt ?? a.assignedAt,
        narration: `${a.assignmentNo} — delivery cost`,
        carrierId: a.riderId ?? a.courierId,
        lines: [
          { accountId: await this.accId(ACC.DELIVERY_COST), debitPaisa: a.costPaisa, orderId: a.orderId },
          // owed to the carrier, not to a supplier — keeps "we owe suppliers" honest
          { accountId: await this.accId(ACC.ACCRUED), creditPaisa: a.costPaisa },
        ],
      });
    });
  }

  /* ==================== REPLAY ==================== */

  /** re-run a failed posting from the Ledger screen (DEC-FIN-010) */
  async replay(failureId: string): Promise<{ ok: boolean; message: string }> {
    const f = await this.prisma.db.financePostingFailure.findUnique({ where: { id: failureId } });
    if (!f) return { ok: false, message: 'Not found' };
    const runners: Record<string, (id: string) => Promise<void>> = {
      ORDER: (id) => this.onOrderDelivered(id),
      PAYMENT: (id) => this.onPaymentRecorded(id),
      PURCHASE: (id) => this.onPurchaseReceived(id),
      SUPPLIER_PAYMENT: (id) => this.onSupplierPayment(id),
      RETURN: (id) => this.onReturnCompleted(id),
      POS_SHIFT: (id) => this.onPosShiftClosed(id),
      DELIVERY: (id) => this.onDeliveryCost(id),
      INVENTORY: (id) => this.onStockIssue(id),
    };
    const run = runners[f.sourceType];
    if (!run) return { ok: false, message: `No replay for ${f.sourceType}` };
    await run(f.sourceId);
    const stillFailing = await this.prisma.db.financePostingFailure.findFirst({
      where: { sourceType: f.sourceType, sourceId: f.sourceId, resolvedAt: null, id: { not: f.id } },
    });
    await this.prisma.db.financePostingFailure.update({
      where: { id: f.id },
      data: { resolvedAt: new Date(), retryCount: f.retryCount + 1, state: 'REPLAYED' },
    });
    return {
      ok: !stillFailing,
      message: stillFailing ? 'Tried again and it failed again' : 'Posted',
    };
  }
}
