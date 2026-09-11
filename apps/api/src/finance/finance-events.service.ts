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

/**
 * How Returns marks the stock it sends back out on a replacement — written by
 * `returns.service.ts` as `"<orderNo> · replacement <returnNo>"`. Finance reads
 * it to tell a replacement apart from an ordinary sale line on the same order.
 */
const REPLACEMENT_NOTE = /· replacement RTN-/;
/*  a void puts the goods back with `· void` on the movement. Counting it as
    cost would double a voided bill's COGS on any later replay.  */
const VOID_NOTE = /· void\b/;

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
      /*  ⚠️ A CANCELLED BILL HAS NO REVENUE TO POST. Replaying a failed posting
          used to land here for a voided counter bill and write an advance
          release out of 2100 — money the books had never been given. There is
          nothing to recognise on an order that was undone.  */
      if (o.salesStatus === 'cancelled') return;

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

      /*  Money already taken before delivery was held as a liability — release
          exactly that, nothing taken later (that clears the receivable directly).

          ═══ P7-15 (31 Aug 2026) — WHICH money is "already taken" ═══

          This used to sum every payment row on the order. On a website order
          that is right: the money really did arrive first and really is sitting
          in 2100. At the counter it was wrong, and wrong on every single sale.
          POS writes its payment rows inside the same transaction as the order,
          so by the time revenue posts they already EXIST — but they have not
          been booked yet. The release fired for them anyway, and then
          `onPaymentRecorded` posted the same money again, correctly, against
          1100. Receivable credited twice; 2100 debited for an advance nobody
          ever credited.

          Caught by walking POS-000017: a 60 taka bill paid 30 cash + 30 store
          credit should have left 1100 untouched, and it moved −30.

          `financePostedAt` is the honest test. A payment stamped before this
          runs was booked while no revenue entry existed, which is exactly the
          case where it landed in 2100. One stamped later — or not at all — went
          to 1100 by itself and must not be released here.  */
      const advance = o.transactions
        .filter(
          (t) =>
            !t.deletedAt &&
            (t.kind === 'ADVANCE' || t.kind === 'PAYMENT') &&
            (t as { financePostedAt?: Date | null }).financePostedAt != null,
        )
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
  /**
   * What the goods on THIS ORDER cost, out of the stock ledger.
   *
   * ⚠️ P8-1 — a replacement handed out on a return leaves the shelf through
   * `inventory.postSaleForOrder` **against the original order** (DEC-RTN-017),
   * so its movement looks exactly like a second sale on a bill that was
   * already delivered and already costed. It is excluded here and booked by
   * `onReturnCompleted` instead, because the order's `:cogs` entry is keyed
   * and a second post against it is silently swallowed — which is precisely
   * how ৳405.15 of goods left the shop with the books never hearing.
   */
  private async saleMovementValue(orderId: string): Promise<number> {
    const moves = await this.prisma.db.inventoryMovement.findMany({
      where: { refType: 'ORDER', refId: orderId, reason: 'SALE' },
      select: { valuePaisa: true, note: true },
    });
    return moves
      .filter((m) => !REPLACEMENT_NOTE.test(m.note ?? '') && !VOID_NOTE.test(m.note ?? ''))
      .reduce((n, m) => n + Math.abs(m.valuePaisa), 0);
  }

  /** the goods sent back out on one return's replacement, at their own cost */
  private async replacementMovementValue(orderId: string, returnNo: string): Promise<number> {
    const moves = await this.prisma.db.inventoryMovement.findMany({
      where: { refType: 'ORDER', refId: orderId, reason: 'SALE', note: { contains: `replacement ${returnNo}` } },
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
        /*  ⚠️ WHAT IS BEING GIVEN BACK DEPENDS ON WHETHER IT WAS EVER EARNED.

            Money handed back on a bill the books have recognised is a sales
            return: 4100 contras the revenue. But an ADVANCE — taken weeks
            before the goods, and cancelled before hand-over — never became
            revenue at all: `createSale` posts no `:revenue` entry for it and
            the money sat in 2100 Customer Advance, a liability. Debiting 4100
            there contras revenue that does not exist: the shop's profit report
            carries a return against nothing, and 2100 stays credited for ever
            for a customer who has already been paid back.

            Same test the inbound direction already makes, twelve lines down:
            has this order's revenue been posted?  */
        const recognised = await this.prisma.db.journalEntry.findUnique({
          where: { sourceKey: `ORDER:${p.orderId}:revenue` },
          select: { id: true },
        });
        await this.finance.postEntry({
          sourceType: 'PAYMENT',
          sourceId: p.id,
          sourceKey: key,
          entryDate: p.createdAt,
          narration: recognised ? `${counter} — refunded` : `${counter} — advance given back`,
          lines: [
            {
              accountId: await this.accId(recognised ? ACC.SALES_RETURN : ACC.CUSTOMER_ADVANCE),
              debitPaisa: p.amountPaisa,
              orderId: p.orderId,
            },
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

  /**
   * ═══ A COUNTER BILL WAS VOIDED — owner, 11 Sep 2026 ═════════════════════
   *
   * The till could void a bill from the day it was built: the order was
   * cancelled, the stock went back on the shelf and the customer got the money.
   * The BOOKS heard none of it. Revenue, VAT and cost of goods stayed posted,
   * the cash receipt stayed posted, and the month's profit carried a sale that
   * never happened — with nothing but a warning line on the order's timeline to
   * say so. The owner, asked: *"yes, build it."*
   *
   * ⚠️ NOTHING IS DELETED OR EDITED. DEC-FIN-014 — the ledger is immutable and a
   * correction is a new entry that mirrors the old one. So every entry this bill
   * posted is read back and posted again the other way round: same accounts,
   * same money, debits and credits swapped. The original stays legible for ever,
   * and the two together come to nothing, which is the truth about a bill that
   * was rung up by mistake.
   *
   * What gets reversed is worked out from the LEDGER, never from a formula:
   * whatever entries carry this order (its revenue, its cost of goods, its
   * advance release) and whatever payment entries carry its money. A bill that
   * posted nothing — an advance, which books no revenue until hand-over —
   * reverses nothing, and that is correct rather than a special case.
   *
   * Idempotent through `sourceKey` (DEC-FIN-023): the mirror of `X` is `X:void`,
   * so a second void finds its work already done. A reversal is never itself
   * reversed.
   */
  async onPosSaleVoided(orderId: string, actorName?: string): Promise<void> {
    if (!(await this.enabled())) return;
    /*  ⚠️ ITS OWN REPLAY IDENTITY. A failure filed as a plain ORDER would be
        replayed through `onOrderDelivered`, which on a cancelled bill posts an
        advance release out of a liability nobody credited — money invented on
        a bill that never happened. The `void:` prefix routes a replay back
        here instead (see `replay()`).  */
    await this.safe('ORDER', `void:${orderId}`, async () => {
      const o = await this.prisma.db.order.findUnique({
        where: { id: orderId },
        select: { orderNo: true, branchId: true },
      });
      if (!o) return;

      /*  ⚠️ STORE CREDIT IS NOT A PAYMENT ROW. Credit spent at the till is a
          `CustomerCredit` row, and its entry is filed under RETURN with the
          CREDIT's id and no order on either line — so neither arm below can
          see it. Left out, a bill part-paid with credit leaves that much
          stranded in 1100 Receivable for ever and understates the shop's
          store-credit liability by the same amount. Found by the review of
          this method, the same day it was written.  */
      const creditRows = await this.prisma.db.customerCredit.findMany({
        where: { refType: 'ORDER', refId: orderId, kind: 'CONSUMED', deletedAt: null },
        select: { id: true },
      });
      const creditKeys = creditRows.map((c) => `CREDIT:${c.id}:used`);

      /*  every entry that carries this bill: the ones posted against the ORDER
          itself, the payment entries whose lines name it, and the store-credit
          entries above  */
      const posted = await this.prisma.db.journalEntry.findMany({
        where: {
          OR: [
            { sourceType: 'ORDER', sourceId: orderId },
            { sourceType: 'PAYMENT', lines: { some: { orderId } } },
            ...(creditKeys.length ? [{ sourceKey: { in: creditKeys } }] : []),
          ],
        },
        include: { lines: true },
        orderBy: { entryDate: 'asc' },
      });

      /*  ⚠️ ONLY THE ENTRIES THIS BILL POSTED. Anything else filed against the
          order — above all an `isManual` correction an accountant wrote for a
          reason of their own — is NOT this method's to mirror. Reversing
          somebody's hand-written correction would put a wrong number in the
          books with nothing to explain it.  */
      const OWNED = [':revenue', ':cogs', ':advance-release'];
      for (const e of posted) {
        /*  a reversal is not reversed — neither its own, nor one written by an
            earlier correction  */
        if (!e.sourceKey || e.sourceKey.endsWith(':void')) continue;
        const isOurs =
          e.sourceType === 'PAYMENT' ||
          creditKeys.includes(e.sourceKey) ||
          OWNED.some((suffix) => e.sourceKey!.endsWith(suffix));
        if (!isOurs) {
          if (e.isManual) {
            this.logger.warn(
              `${o.orderNo} voided — ${e.sourceKey} is a manual entry and was left alone; check by hand whether it still belongs`,
            );
          }
          continue;
        }

        const sourceKey = `${e.sourceKey}:void`;
        const already = await this.prisma.db.journalEntry.findUnique({
          where: { sourceKey },
          select: { id: true },
        });
        if (already) continue;

        /*  ⚠️ A SHARED ENTRY IS NEVER HALF-REVERSED. If any line names a
            DIFFERENT order, this entry carries more than this bill and taking
            a slice out of it would reverse somebody else's money. Say so and
            leave it for a person. (An untagged line — the money account on a
            payment entry — is ours by construction in every entry this
            codebase writes.)  */
        if (e.lines.some((l) => l.orderId && l.orderId !== orderId)) {
          this.logger.warn(
            `${o.orderNo}: ${e.sourceKey} carries more than this bill — reverse it by hand in Finance`,
          );
          continue;
        }
        if (e.lines.length === 0) continue;

        const lines: LineInput[] = e.lines.map((l) => ({
          accountId: l.accountId,
          // the mirror: what was debited is credited, and the other way round
          debitPaisa: l.creditPaisa,
          creditPaisa: l.debitPaisa,
          orderId: l.orderId,
          itemId: l.itemId,
          employeeId: l.employeeId,
          employeeName: l.employeeName,
          partnerId: l.partnerId,
          occasion: l.occasion,
          zone: l.zone,
          channelId: l.channelId,
          note: `void of ${e.entryNo ?? e.sourceKey}`,
        }));
        await this.finance.postEntry({
          /*  filed under the SAME source as the original, so every screen that
              asks "what did this payment post?" finds the pair together. Only
              the key differs.  */
          sourceType: e.sourceType as PostEntryInput['sourceType'],
          sourceId: e.sourceId ?? orderId,
          sourceKey,
          /*  the schema's own record of the pair, and a second guarantee:
              `reversesId` is @unique, so one entry can be reversed once  */
          reversesId: e.id,
          entryDate: new Date(),
          narration: `${o.orderNo} voided — reversing ${e.narration ?? e.sourceKey}`,
          branchId: o.branchId,
          actorName,
          lines,
        });
      }

      /*  `financePostedAt` is deliberately LEFT ALONE. It says "this bill has
          been through the books", and it has — twice, once each way. Clearing
          it would claim the bill was never posted, which is not true and would
          make the drift checker ask for an entry that already exists beside its
          own mirror.  */
    });
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

  /** what the stock ledger says arrived on this bill, at the cost it posted */
  private async purchaseMovementValue(purchaseId: string): Promise<number> {
    const moves = await this.prisma.db.inventoryMovement.findMany({
      where: { refId: purchaseId, reason: 'PURCHASE' },
      select: { valuePaisa: true },
    });
    return moves.reduce((n, m) => n + Math.abs(m.valuePaisa), 0);
  }

  /** how much of this bill's goods is already standing in 2050, unbilled */
  private async goodsNotBilled(purchaseId: string): Promise<number> {
    const acc = await this.accId(ACC2.GOODS_NOT_BILLED);
    const lines = await this.prisma.db.journalLine.findMany({
      where: { accountId: acc, entry: { sourceType: 'PURCHASE', sourceId: purchaseId } },
      select: { debitPaisa: true, creditPaisa: true },
    });
    return lines.reduce((n, l) => n + l.creditPaisa - l.debitPaisa, 0);
  }

  /**
   * ═══ P8-3 (1 Sep 2026) — GOODS FROM A BILL THAT IS NOT FINISHED YET ═══
   *
   * A purchase may be received in several deliveries (DEC-PUR-001), and
   * Finance books the bill only when the LAST box lands (PUR-REV-2 — rightly,
   * because that entry carries the whole bill and firing it early booked all
   * of it against one delivery). Between the first delivery and the last, the
   * goods are on the shelf and the books have never heard of them: PUR-000012
   * had ৳900 of stock standing in the shop and ৳0 in the ledger.
   *
   * So each delivery is booked as it arrives, at the value the stock ledger
   * gave it, against **2050 Goods Received, Not Billed** — a liability,
   * because we hold goods we have not agreed a bill for. `onPurchaseReceived`
   * clears it when the bill completes, so nothing is counted twice.
   *
   * Keyed on the MOVEMENT, which is the event itself: replaying it posts
   * nothing, and a second delivery cannot land on the first one's key.
   */
  async onPurchaseGoodsIn(movementId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('PURCHASE', movementId, async () => {
      const m = await this.prisma.db.inventoryMovement.findUnique({ where: { id: movementId } });
      if (!m || m.reason !== 'PURCHASE' || !m.refId) return;
      const value = Math.abs(m.valuePaisa);
      if (value <= 0) return;
      const p = await this.prisma.db.purchase.findUnique({
        where: { id: m.refId },
        select: { id: true, purchaseNo: true, status: true, deletedAt: true, purchaseDate: true },
      });
      if (!p || p.deletedAt) return;
      // the bill is already booked in full — its own entry carries these goods
      if (p.status === 'RECEIVED') return;
      if (await this.beforeGoLive(m.createdAt)) return;

      await this.finance.postEntry({
        sourceType: 'PURCHASE',
        sourceId: p.id,
        sourceKey: `MOVEMENT:${movementId}:goods-in`,
        entryDate: m.createdAt,
        narration: `${p.purchaseNo} — goods arrived, the bill is not finished yet`,
        lines: [
          { accountId: await this.accId(ACC.INVENTORY), debitPaisa: value },
          { accountId: await this.accId(ACC2.GOODS_NOT_BILLED), creditPaisa: value },
        ],
      });
    });
  }

  /**
   * Goods received from a supplier — stock goes up, we owe them.
   *
   * ⚠️ P8-4 (1 Sep 2026) — **stock is booked at the value the stock ledger
   * gave it, not at the bill's grand total.** Those are two different numbers
   * whenever the bill carries a discount or a round-off: the ledger costs the
   * goods line by line, the bill is what the supplier is owed. Booking the
   * grand total into 1150 made the books disagree with the shelf by ৳334.21
   * across thirteen bills — a gap no stock movement could ever explain,
   * because no stock had moved.
   *
   * The difference is what the bill saved or cost over the goods themselves,
   * and it belongs in `5150 Inventory Adjustment` with the other small gains
   * and losses of the period. What this buys: 1150 now equals the stock
   * ledger **by construction**, so the drift check can only ever fire on a
   * posting that is genuinely missing.
   */
  async onPurchaseReceived(purchaseId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('PURCHASE', purchaseId, async () => {
      const p = await this.prisma.db.purchase.findUnique({ where: { id: purchaseId } });
      if (!p || p.deletedAt || p.grandTotalPaisa <= 0) return;
      if (await this.beforeGoLive(p.purchaseDate)) return;

      const goods = await this.purchaseMovementValue(purchaseId);
      const held = await this.goodsNotBilled(purchaseId);
      /*  VAT on a supplier bill is the government's, reclaimable — it was never
          part of what the stock cost. Nothing on the system carries purchase VAT
          yet, and the old entry would have capitalised it into the shelf. */
      const vat = p.vatPaisa ?? 0;
      const basis = p.grandTotalPaisa - vat - goods; // bill-level discount / round-off
      const lines: LineInput[] = [
        { accountId: await this.accId(ACC.SUPPLIER_PAYABLE), creditPaisa: p.grandTotalPaisa },
      ];
      if (vat > 0) lines.push({ accountId: await this.accId(ACC.VAT_INPUT), debitPaisa: vat });
      // the goods not already standing in 2050 from an earlier delivery
      if (goods - held > 0)
        lines.push({ accountId: await this.accId(ACC.INVENTORY), debitPaisa: goods - held });
      else if (goods - held < 0)
        lines.push({ accountId: await this.accId(ACC.INVENTORY), creditPaisa: held - goods });
      if (held > 0) lines.push({ accountId: await this.accId(ACC2.GOODS_NOT_BILLED), debitPaisa: held });
      if (basis !== 0)
        lines.push(
          basis > 0
            ? { accountId: await this.accId(ACC.INV_ADJUSTMENT), debitPaisa: basis }
            : { accountId: await this.accId(ACC.INV_ADJUSTMENT), creditPaisa: -basis },
        );

      await this.finance.postEntry({
        sourceType: 'PURCHASE',
        sourceId: purchaseId,
        sourceKey: `PURCHASE:${purchaseId}:received`,
        entryDate: p.receivedAt ?? p.purchaseDate,
        narration: `${p.purchaseNo} received from ${p.supplierName}`,
        lines,
      });

      /*  P7-17 — money paid BEFORE the goods came is an advance sitting in
          1200, not a payment against a bill that did not exist yet
          (DEC-PUR-004). The goods are here now, so the advance becomes payment:
          the payable falls and the advance is used up.

          Counted from the LEDGER, never from the payment rows — the same
          discipline P7-15 had to be taught. Only what actually reached 1200
          may be taken out of it.  */
      const advanced = await this.advanceHeldFor(purchaseId);
      if (advanced > 0) {
        await this.finance.postEntry({
          sourceType: 'PURCHASE',
          sourceId: purchaseId,
          sourceKey: `PURCHASE:${purchaseId}:advance-applied`,
          entryDate: p.receivedAt ?? p.purchaseDate,
          narration: `${p.purchaseNo} — advance paid earlier applied to the bill`,
          lines: [
            { accountId: await this.accId(ACC.SUPPLIER_PAYABLE), debitPaisa: advanced },
            { accountId: await this.accId(ACC.SUPPLIER_ADVANCE), creditPaisa: advanced },
          ],
        });
      }
    });
  }

  /**
   * How much of this bill's money is still sitting in 1200 Supplier Advance.
   *
   * ⚠️ P8-2 — this used to read only the payment's own `:paid` entry, and that
   * is why ৳1,070 never came out of 1200. The P7-17 cleanup put those payments
   * into the advance account through a SECOND, correcting entry
   * (`:advance-fix`) — and it ran *after* those three bills had already been
   * received, so the release had come and gone before there was anything to
   * release. Reading every line the ledger holds against the advance account,
   * and subtracting whatever has already been applied, cannot go stale that
   * way: it asks the books what is there now.
   */
  private async advanceHeldFor(purchaseId: string): Promise<number> {
    const advanceAcc = await this.accId(ACC.SUPPLIER_ADVANCE);
    const payments = await this.prisma.db.purchasePayment.findMany({
      where: { purchaseId, deletedAt: null },
      select: { id: true },
    });
    let held = 0;
    for (const pay of payments) {
      const lines = await this.prisma.db.journalLine.findMany({
        where: { accountId: advanceAcc, entry: { sourceId: pay.id } },
        select: { debitPaisa: true, creditPaisa: true },
      });
      held += lines.reduce((n, l) => n + l.debitPaisa - l.creditPaisa, 0);
    }
    const applied = await this.prisma.db.journalLine.findMany({
      where: { accountId: advanceAcc, entry: { sourceType: 'PURCHASE', sourceId: purchaseId } },
      select: { debitPaisa: true, creditPaisa: true },
    });
    held -= applied.reduce((n, l) => n + l.creditPaisa - l.debitPaisa, 0);
    return Math.max(held, 0);
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
        include: { supplier: { select: { name: true } }, allocations: { select: { amountPaisa: true } } },
      });
      if (!sp || sp.deletedAt || sp.amountPaisa <= 0) return;
      if (await this.beforeGoLive(sp.paidAt)) return;

      /*
        ═══ P8-5 (1 Sep 2026) — MONEY AGAINST NO BILL IS NOT A PAYMENT ═══

        This used to debit 2000 Supplier Payable with the whole amount, however
        much of it was actually put against a bill. `SPY-000001` (৳500 to
        Ajgor) and `SPY-000002` (৳1,000 to Apu) carry no allocation at all —
        Apu has no bills in the register whatsoever — so ৳1,500 of the books'
        supplier debt was discharged against nothing. The purchase register
        knew nothing of it, and that is most of the ৳430 the two sides
        disagreed by.

        Money handed to a supplier with no bill behind it is value THEY are
        holding for us — the same thing as paying ahead (DEC-PUR-004), and the
        drift checker's own advice line has said so all along. So: the part put
        against bills clears the payable, and the rest goes to 1200 Supplier
        Advance, where `onPurchaseReceived` will move it across when the goods
        finally arrive.
      */
      const allocated = Math.min(
        sp.allocations.reduce((n, a) => n + a.amountPaisa, 0),
        sp.amountPaisa,
      );
      const onAccount = sp.amountPaisa - allocated;
      const lines: LineInput[] = [];
      if (allocated > 0)
        lines.push({ accountId: await this.accId(ACC.SUPPLIER_PAYABLE), debitPaisa: allocated });
      if (onAccount > 0)
        lines.push({ accountId: await this.accId(ACC.SUPPLIER_ADVANCE), debitPaisa: onAccount });
      lines.push({
        accountId: await this.moneyAccountFor(sp.method, (sp as { accountId?: string | null }).accountId),
        creditPaisa: sp.amountPaisa,
      });

      await this.finance.postEntry({
        sourceType: 'SUPPLIER_PAYMENT',
        sourceId: sp.id,
        sourceKey: `SUPPLIER_PAYMENT:${sp.id}:paid`,
        entryDate: sp.paidAt,
        narration: onAccount > 0 && allocated === 0
          ? `${sp.paymentNo} — paid ${sp.supplier?.name ?? 'supplier'} against no bill (held as an advance)`
          : `${sp.paymentNo} — paid ${sp.supplier?.name ?? 'supplier'}`,
        lines,
      });
      await this.prisma.db.supplierPayment.update({
        where: { id: sp.id },
        data: { financePostedAt: new Date() },
      });
    });
  }

  /**
   * ═══ P7-12 (31 Aug 2026) — GOODS WENT BACK TO THE SUPPLIER ═══
   *
   * `purchases.createReturn` cut the bill's due, created a `SupplierCredit` for
   * the excess and sent the stock back out through Inventory — and had **no
   * finance call in it at all**. There was nothing to call: this event did not
   * exist, and the whole `finance/` folder mentioned purchase returns only in
   * the books-reset wipe list. So the goods left, the debt fell, the supplier
   * started owing us — and the ledger knew none of it (CLAUDE.md §4 rule 4a).
   *
   * Three facts, one entry:
   *   Inventory falls by what went back (credit)
   *   what we owe the supplier falls by the part cut from this bill (debit)
   *   what the supplier now owes us becomes a Supplier Advance (debit) — it is
   *   the same thing as money paid ahead: value they are holding for us
   *
   * The document's own numbers are used, not the stock movement's, because the
   * split between "cut from the due" and "left as credit" is a commercial fact
   * the return decided (DEC-PUR-006) and the two are equal by construction.
   */
  async onPurchaseReturned(returnId: string): Promise<void> {
    if (!(await this.enabled())) return;
    await this.safe('PURCHASE', returnId, async () => {
      const r = await this.prisma.db.purchaseReturn.findUnique({
        where: { id: returnId },
        include: { purchase: { select: { purchaseNo: true, supplierName: true } } },
      });
      if (!r || r.totalPaisa <= 0) return;
      if (await this.beforeGoLive(r.createdAt)) return;

      const lines: LineInput[] = [];
      if (r.dueCutPaisa > 0)
        lines.push({ accountId: await this.accId(ACC.SUPPLIER_PAYABLE), debitPaisa: r.dueCutPaisa });
      if (r.creditPaisa > 0)
        lines.push({ accountId: await this.accId(ACC.SUPPLIER_ADVANCE), debitPaisa: r.creditPaisa });
      lines.push({ accountId: await this.accId(ACC.INVENTORY), creditPaisa: r.totalPaisa });

      await this.finance.postEntry({
        sourceType: 'PURCHASE',
        sourceId: returnId,
        sourceKey: `PURCHASE_RETURN:${returnId}:goods-back`,
        entryDate: r.createdAt,
        narration: `${r.returnNo} — goods returned to ${r.purchase?.supplierName ?? 'the supplier'}`,
        lines,
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

      /*  P7-17 (31 Aug 2026) — money handed over BEFORE the goods arrive is an
          advance, not a payment against a bill (DEC-PUR-004). Posting it
          against 2000 credits a payable that does not exist yet, which is how
          the books came to show LESS owed to suppliers than the purchase
          register did. When the goods arrive, `onPurchaseReceived` moves it
          across.  */
      const purchase = await this.prisma.db.purchase.findUnique({
        where: { id: pp.purchaseId },
        select: { receivedAt: true, purchaseNo: true },
      });
      const beforeGoods = !purchase?.receivedAt || pp.paidAt < purchase.receivedAt;
      await this.finance.postEntry({
        sourceType: 'PURCHASE',
        sourceId: pp.id,
        sourceKey: `PURCHASE_PAYMENT:${pp.id}:paid`,
        entryDate: pp.paidAt,
        narration: beforeGoods
          ? `${purchase?.purchaseNo ?? 'Purchase'} — paid in advance, before the goods came`
          : 'Paid a supplier bill',
        lines: [
          {
            accountId: await this.accId(beforeGoods ? ACC.SUPPLIER_ADVANCE : ACC.SUPPLIER_PAYABLE),
            debitPaisa: pp.amountPaisa,
          },
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
  /**
   * Post the restock the books never heard about.
   *
   * Every completed return is replayed through `onReturnCompleted`. That is
   * safe to run twice: `postEntry` is idempotent on `sourceKey` (DEC-FIN-023),
   * so the store-credit and compensation entries that already exist are
   * skipped and only the missing `:restock` ones are written.
   */
  async backfillReturnRestock(): Promise<{
    found: number;
    posted: number;
    alreadyPosted: number;
    restockedPaisa: number;
  }> {
    const rows = await this.prisma.db.salesReturn.findMany({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    let posted = 0;
    let alreadyPosted = 0;
    let restockedPaisa = 0;

    for (const r of rows) {
      const key = `RETURN:${r.id}:restock`;
      const seen = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: key },
        select: { id: true },
      });
      if (seen) {
        alreadyPosted += 1;
        continue;
      }
      await this.onReturnCompleted(r.id);
      const now = await this.prisma.db.journalEntry.findFirst({
        where: { sourceKey: key },
        select: { id: true, lines: { select: { debitPaisa: true } } },
      });
      if (now) {
        posted += 1;
        restockedPaisa += now.lines.reduce((n, l) => n + l.debitPaisa, 0);
      }
    }

    this.logger.log(
      `return restock backfill — ${rows.length} returns, ${posted} posted, ` +
        `${alreadyPosted} already there, ${restockedPaisa / 100} taka back into stock`,
    );
    return { found: rows.length, posted, alreadyPosted, restockedPaisa };
  }

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

    /*  P7-16 — the payment written with the bill itself never posted; only
        money added to a bill later did. Same sweep, same idempotency
        (`onPurchasePayment` skips anything a supplier payment already covered,
        DEC-FIN-022).  */
    const pays = await this.prisma.db.purchasePayment.findMany({
      where: { deletedAt: null, amountPaisa: { gt: 0 } },
      select: { id: true },
      orderBy: { paidAt: 'asc' },
    });
    for (const p of pays) {
      const seen = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: `PURCHASE_PAYMENT:${p.id}:paid` },
        select: { id: true },
      });
      if (seen) { alreadyPosted += 1; continue; }
      await this.onPurchasePayment(p.id);
      const now = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: `PURCHASE_PAYMENT:${p.id}:paid` },
        select: { id: true },
      });
      if (now) posted += 1;
    }

    /*  P7-12 — purchase returns were in the same position: the door existed,
        the event did not. Same rules, same idempotency.  */
    const rets = await this.prisma.db.purchaseReturn.findMany({
      where: { totalPaisa: { gt: 0 } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const r of rets) {
      const seen = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: `PURCHASE_RETURN:${r.id}:goods-back` },
        select: { id: true },
      });
      if (seen) { alreadyPosted += 1; continue; }
      await this.onPurchaseReturned(r.id);
      const now = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: `PURCHASE_RETURN:${r.id}:goods-back` },
        select: { id: true },
      });
      if (now) posted += 1;
    }

    return { found: rows.length + rets.length, posted, alreadyPosted };
  }

  /**
   * ═══ P7-15 · CLEANING UP AFTER THE BUG (31 Aug 2026) ═══
   *
   * Fixing the rule stopped new sales going wrong; it did nothing about the
   * entries already written. Those are the reason the books say customers owe
   * **minus** ৳12,642 — a number that cannot be true.
   *
   * ⚠️ This does NOT write off anything and it invents no account. It reverses
   * exactly the part of each old "money taken earlier" entry that was never an
   * advance in the first place, and it works that out from the ledger rather
   * than from an assumption:
   *
   *   justified = how much of that order's payments a journal line actually
   *               credited to 2100 Customer Advance
   *   wrong     = what the release claimed − justified
   *
   * On a counter sale the justified part is normally zero, because POS books
   * its payments after revenue and they go straight to 1100. On a website
   * order it is normally the whole amount, so nothing is reversed there — which
   * is why this only ever touches what is actually broken.
   *
   * Idempotent by `sourceKey` (DEC-FIN-023): run it twice and the second run
   * finds nothing to do.
   */
  async fixWrongAdvanceReleases(): Promise<{
    looked: number;
    fixed: number;
    alreadyFixed: number;
    reversedPaisa: number;
  }> {
    await this.finance.ensureSeed();
    const releases = await this.prisma.db.journalEntry.findMany({
      where: { sourceType: 'ORDER', sourceKey: { endsWith: ':advance-release' } },
      include: { lines: true },
      orderBy: { entryDate: 'asc' },
    });

    const advanceAccId = await this.accId(ACC.CUSTOMER_ADVANCE);
    const receivableAccId = await this.accId(ACC.RECEIVABLE);

    let fixed = 0;
    let alreadyFixed = 0;
    let reversedPaisa = 0;

    for (const rel of releases) {
      const orderId = rel.sourceId;
      if (!orderId) continue;

      const order = await this.prisma.db.order.findUnique({
        where: { id: orderId },
        select: { orderNo: true, fulfillmentType: true },
      });
      // a website order's release is the honest case — leave it alone
      if (!order || order.fulfillmentType !== 'COUNTER') continue;

      const claimed = rel.lines
        .filter((l) => l.accountId === advanceAccId)
        .reduce((n, l) => n + l.debitPaisa, 0);
      if (claimed <= 0) continue;

      /*  what really went into 2100 for this order: every journal line on its
          payment entries that credited Customer Advance  */
      const paymentEntries = await this.prisma.db.journalEntry.findMany({
        where: { sourceType: 'PAYMENT', lines: { some: { orderId } } },
        include: { lines: true },
      });
      const justified = paymentEntries
        .flatMap((e) => e.lines)
        .filter((l) => l.accountId === advanceAccId)
        .reduce((n, l) => n + l.creditPaisa, 0);

      const wrong = claimed - justified;
      if (wrong <= 0) continue;

      const sourceKey = `ORDER:${orderId}:advance-release-fix`;
      const done = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey },
        select: { id: true },
      });
      if (done) { alreadyFixed += 1; continue; }

      await this.finance.postEntry({
        sourceType: 'ORDER',
        sourceId: orderId,
        sourceKey,
        narration: `${order.orderNo} — correcting an advance release that was never an advance (P7-15)`,
        isManual: true,
        actorName: 'system',
        lines: [
          { accountId: receivableAccId, debitPaisa: wrong, orderId },
          { accountId: advanceAccId, creditPaisa: wrong, orderId },
        ],
      });
      fixed += 1;
      reversedPaisa += wrong;
    }

    return { looked: releases.length, fixed, alreadyFixed, reversedPaisa };
  }

  /**
   * P7-17 cleanup — an advance already booked against the payable.
   *
   * Before today every purchase payment was posted `Dr 2000`, even one handed
   * over before the goods existed. That credits a bill that has not been raised
   * yet, and it is why the books ended up showing LESS owed to suppliers than
   * the purchase register did.
   *
   * This moves only those: payment posted to 2000, goods not received (or
   * received later than the payment). It reverses nothing else, and like the
   * other cleanups it is keyed, so a second run does nothing.
   */
  async fixAdvancesPostedAsPayable(): Promise<{ looked: number; fixed: number; movedPaisa: number }> {
    await this.finance.ensureSeed();
    const payableAcc = await this.accId(ACC.SUPPLIER_PAYABLE);
    const advanceAcc = await this.accId(ACC.SUPPLIER_ADVANCE);

    const payments = await this.prisma.db.purchasePayment.findMany({
      where: { deletedAt: null, amountPaisa: { gt: 0 } },
      select: { id: true, purchaseId: true, paidAt: true, amountPaisa: true },
    });

    let fixed = 0;
    let movedPaisa = 0;
    for (const pay of payments) {
      const purchase = await this.prisma.db.purchase.findUnique({
        where: { id: pay.purchaseId },
        select: { receivedAt: true, purchaseNo: true },
      });
      const beforeGoods = !purchase?.receivedAt || pay.paidAt < purchase.receivedAt;
      if (!beforeGoods) continue;

      const entry = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: `PURCHASE_PAYMENT:${pay.id}:paid` },
        include: { lines: true },
      });
      const onPayable = (entry?.lines ?? [])
        .filter((l) => l.accountId === payableAcc)
        .reduce((n, l) => n + l.debitPaisa, 0);
      if (onPayable <= 0) continue;

      const sourceKey = `PURCHASE_PAYMENT:${pay.id}:advance-fix`;
      const done = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey },
        select: { id: true },
      });
      if (done) continue;

      await this.finance.postEntry({
        sourceType: 'PURCHASE',
        sourceId: pay.id,
        sourceKey,
        narration: `${purchase?.purchaseNo ?? 'Purchase'} — money paid before the goods is an advance, not a payment (P7-17)`,
        isManual: true,
        actorName: 'system',
        lines: [
          { accountId: advanceAcc, debitPaisa: onPayable },
          { accountId: payableAcc, creditPaisa: onPayable },
        ],
      });
      fixed += 1;
      movedPaisa += onPayable;
    }
    return { looked: payments.length, fixed, movedPaisa };
  }

  /**
   * P8-2 cleanup — release advances that are still sitting in 1200 against
   * bills whose goods have long since arrived.
   *
   * The release normally happens inside `onPurchaseReceived`. For these three
   * bills it had already run before P7-17 moved the money into 1200, so there
   * was nothing to release at the time and nothing has looked since. Keyed, so
   * a second run posts nothing.
   */
  async applyHeldSupplierAdvances(): Promise<{ looked: number; fixed: number; appliedPaisa: number }> {
    await this.finance.ensureSeed();
    const purchases = await this.prisma.db.purchase.findMany({
      where: { status: 'RECEIVED', deletedAt: null },
      select: { id: true, purchaseNo: true, receivedAt: true, purchaseDate: true },
    });

    let fixed = 0;
    let appliedPaisa = 0;
    for (const p of purchases) {
      const held = await this.advanceHeldFor(p.id);
      if (held <= 0) continue;
      const sourceKey = `PURCHASE:${p.id}:advance-applied-late`;
      const done = await this.prisma.db.journalEntry.findUnique({ where: { sourceKey }, select: { id: true } });
      if (done) continue;
      await this.finance.postEntry({
        sourceType: 'PURCHASE',
        sourceId: p.id,
        sourceKey,
        entryDate: p.receivedAt ?? p.purchaseDate,
        narration: `${p.purchaseNo} — advance paid earlier applied to the bill (P8-2)`,
        isManual: true,
        actorName: 'system',
        lines: [
          { accountId: await this.accId(ACC.SUPPLIER_PAYABLE), debitPaisa: held },
          { accountId: await this.accId(ACC.SUPPLIER_ADVANCE), creditPaisa: held },
        ],
      });
      fixed += 1;
      appliedPaisa += held;
    }
    return { looked: purchases.length, fixed, appliedPaisa };
  }

  /**
   * P8-5 cleanup — a supplier payment that discharged a payable it was never
   * put against. Moves only the unallocated part, and only the part the ledger
   * itself shows went to 2000.
   */
  async fixUnallocatedSupplierPayments(): Promise<{ looked: number; fixed: number; movedPaisa: number }> {
    await this.finance.ensureSeed();
    const payableAcc = await this.accId(ACC.SUPPLIER_PAYABLE);
    const advanceAcc = await this.accId(ACC.SUPPLIER_ADVANCE);
    const payments = await this.prisma.db.supplierPayment.findMany({
      where: { deletedAt: null, amountPaisa: { gt: 0 } },
      select: {
        id: true,
        paymentNo: true,
        paidAt: true,
        amountPaisa: true,
        allocations: { select: { amountPaisa: true } },
        supplier: { select: { name: true } },
      },
    });

    let fixed = 0;
    let movedPaisa = 0;
    for (const sp of payments) {
      const allocated = Math.min(sp.allocations.reduce((n, a) => n + a.amountPaisa, 0), sp.amountPaisa);
      const onAccount = sp.amountPaisa - allocated;
      if (onAccount <= 0) continue;

      const entry = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: `SUPPLIER_PAYMENT:${sp.id}:paid` },
        include: { lines: true },
      });
      const onPayable = (entry?.lines ?? [])
        .filter((l) => l.accountId === payableAcc)
        .reduce((n, l) => n + l.debitPaisa, 0);
      const move = Math.min(onAccount, onPayable);
      if (move <= 0) continue;

      const sourceKey = `SUPPLIER_PAYMENT:${sp.id}:on-account-fix`;
      const done = await this.prisma.db.journalEntry.findUnique({ where: { sourceKey }, select: { id: true } });
      if (done) continue;

      await this.finance.postEntry({
        sourceType: 'SUPPLIER_PAYMENT',
        sourceId: sp.id,
        sourceKey,
        entryDate: sp.paidAt,
        narration: `${sp.paymentNo} — paid ${sp.supplier?.name ?? 'supplier'} against no bill, held as an advance (P8-5)`,
        isManual: true,
        actorName: 'system',
        lines: [
          { accountId: advanceAcc, debitPaisa: move },
          { accountId: payableAcc, creditPaisa: move },
        ],
      });
      fixed += 1;
      movedPaisa += move;
    }
    return { looked: payments.length, fixed, movedPaisa };
  }

  /**
   * P8-4 cleanup — bills already booked into stock at their grand total.
   *
   * Brings 1150 back to what the stock ledger actually posted and puts the
   * bill-level discount / round-off into 5150 where it belongs. Nothing is
   * rewritten: this is a correcting entry, keyed like every other.
   */
  async fixPurchaseGoodsBasis(): Promise<{ looked: number; fixed: number; movedPaisa: number }> {
    await this.finance.ensureSeed();
    const inventoryAcc = await this.accId(ACC.INVENTORY);
    const purchases = await this.prisma.db.purchase.findMany({
      where: { status: 'RECEIVED', deletedAt: null },
      select: { id: true, purchaseNo: true, receivedAt: true, purchaseDate: true },
    });

    let fixed = 0;
    let movedPaisa = 0;
    for (const p of purchases) {
      const entry = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: `PURCHASE:${p.id}:received` },
        include: { lines: true },
      });
      if (!entry) continue;
      const booked = entry.lines
        .filter((l) => l.accountId === inventoryAcc)
        .reduce((n, l) => n + l.debitPaisa - l.creditPaisa, 0);
      const goods = await this.purchaseMovementValue(p.id);
      const diff = booked - goods; // what the books put on the shelf over the goods
      if (diff === 0) continue;

      const sourceKey = `PURCHASE:${p.id}:goods-basis-fix`;
      const done = await this.prisma.db.journalEntry.findUnique({ where: { sourceKey }, select: { id: true } });
      if (done) continue;

      await this.finance.postEntry({
        sourceType: 'PURCHASE',
        sourceId: p.id,
        sourceKey,
        entryDate: p.receivedAt ?? p.purchaseDate,
        narration: `${p.purchaseNo} — stock valued as the stock ledger valued it (P8-4)`,
        isManual: true,
        actorName: 'system',
        lines:
          diff > 0
            ? [
                { accountId: await this.accId(ACC.INV_ADJUSTMENT), debitPaisa: diff },
                { accountId: inventoryAcc, creditPaisa: diff },
              ]
            : [
                { accountId: inventoryAcc, debitPaisa: -diff },
                { accountId: await this.accId(ACC.INV_ADJUSTMENT), creditPaisa: -diff },
              ],
      });
      fixed += 1;
      movedPaisa += Math.abs(diff);
    }
    return { looked: purchases.length, fixed, movedPaisa };
  }

  /** P8-3 cleanup — goods standing in the shop from a bill still being received */
  async backfillGoodsNotBilled(): Promise<{ looked: number; posted: number }> {
    await this.finance.ensureSeed();
    const open = await this.prisma.db.purchase.findMany({
      where: { deletedAt: null, status: { notIn: ['RECEIVED', 'CANCELLED'] } },
      select: { id: true },
    });
    let posted = 0;
    for (const p of open) {
      const moves = await this.prisma.db.inventoryMovement.findMany({
        where: { refId: p.id, reason: 'PURCHASE' },
        select: { id: true },
      });
      for (const m of moves) {
        const seen = await this.prisma.db.journalEntry.findUnique({
          where: { sourceKey: `MOVEMENT:${m.id}:goods-in` },
          select: { id: true },
        });
        if (seen) continue;
        await this.onPurchaseGoodsIn(m.id);
        const now = await this.prisma.db.journalEntry.findUnique({
          where: { sourceKey: `MOVEMENT:${m.id}:goods-in` },
          select: { id: true },
        });
        if (now) posted += 1;
      }
    }
    return { looked: open.length, posted };
  }

  /**
   * P8-1 cleanup — replay every completed return so the replacement cost lands.
   *
   * `backfillReturnRestock` cannot do this: it skips any return that already
   * has a `:restock` entry, which is every return that matters here.
   * `onReturnCompleted` is idempotent on each of its four keys, so replaying
   * all of them writes only what is missing.
   */
  async backfillReplacementCost(): Promise<{ looked: number; posted: number; costPaisa: number }> {
    await this.finance.ensureSeed();
    const rows = await this.prisma.db.salesReturn.findMany({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    let posted = 0;
    let costPaisa = 0;
    for (const r of rows) {
      const key = `RETURN:${r.id}:replacement-cost`;
      const seen = await this.prisma.db.journalEntry.findUnique({ where: { sourceKey: key }, select: { id: true } });
      if (seen) continue;
      await this.onReturnCompleted(r.id);
      const now = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: key },
        select: { lines: { select: { debitPaisa: true } } },
      });
      if (now) {
        posted += 1;
        costPaisa += now.lines.reduce((n, l) => n + l.debitPaisa, 0);
      }
    }
    return { looked: rows.length, posted, costPaisa };
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

      /*
        Goods that came back into stock reduce the cost of sales again.

        ⚠️ `refType` is 'SALE_RETURN', not 'RETURN'. Inventory writes it that
        way (inventory.service.ts, both branches) and the Returns module reads
        it that way — Finance alone looked for 'RETURN', found nothing every
        single time, and posted no entry at all. Silent, because zero rows is
        not an error.

        Found 1 Sep by taking the stock drift apart: 16 SALE_RETURN movements
        worth ৳3,560 had put stock back on the shelf and the books had never
        been told, so inventory read ৳3,560 light and COGS ৳3,560 heavy. Not
        one `:restock` entry existed in the whole ledger.

        Both spellings are accepted so nothing written under the old literal is
        stranded — this is a read, and being generous here costs nothing.
      */
      const back = await this.prisma.db.inventoryMovement.findMany({
        where: {
          refType: { in: ['SALE_RETURN', 'RETURN'] },
          refId: returnId,
          reason: 'SALE_RETURN',
        },
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

      /*
        ═══ P8-1 (1 Sep 2026) — THE REPLACEMENT THAT LEFT THE SHOP FOR FREE ═══

        A replacement sends new goods out to the customer (DEC-RTN-017), and
        that stock-out is written **against the original order**. The order's
        cost entry is keyed `ORDER:<id>:cogs` and was posted the day it was
        delivered, so the second stock-out reached a key that already existed
        and `postEntry` swallowed it as a duplicate. Silently: nothing failed,
        nothing was logged, and the goods simply left.

        Found 1 Sep by taking the ৳160.64 stock drift apart — POS-000013 sent
        out ৳400 of roses on RTN-000016 and POS-000003 ৳5.15 on RTN-000011,
        and the two together are the whole sales-side gap.

        The shape is the mirror of the restock above: the returned unit came
        back at cost (Dr stock / Cr COGS), the new one goes out at cost
        (Dr COGS / Cr stock). The shop therefore bears the cost of exactly one
        unit — which is the truth of a replacement — instead of none.
      */
      const replaced = await this.replacementMovementValue(r.orderId, r.returnNo);
      if (replaced > 0)
        await this.finance.postEntry({
          sourceType: 'RETURN',
          sourceId: returnId,
          sourceKey: `RETURN:${returnId}:replacement-cost`,
          entryDate: r.updatedAt,
          narration: `${r.returnNo} — cost of the replacement handed over`,
          lines: [
            { accountId: await this.accId(ACC.COGS), debitPaisa: replaced },
            { accountId: await this.accId(ACC.INVENTORY), creditPaisa: replaced },
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
      /*  a void files itself as `void:<orderId>` so a replay comes back HERE
          and not to `onOrderDelivered`, which on a cancelled bill would post an
          advance release against a liability nobody ever credited  */
      ORDER: (id) => (id.startsWith('void:') ? this.onPosSaleVoided(id.slice(5)) : this.onOrderDelivered(id)),
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
