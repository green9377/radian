import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseStatus, PayMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { ItemsService } from '../items/items.service';
import { InventoryService } from '../inventory/inventory.service';
import { FinanceEventsService } from '../finance/finance-events.service';
import { PaymentMethodsService } from '../common/payment-methods.service';
import type {
  PurchaseCreateDto,
  PurchasePatch,
  ReceiveDto,
  PaymentDto,
  ReturnCreateDto,
  PurchaseListQuery,
} from './purchase.dto';

/*
  PURCHASE — service layer.
  Full architecture + decision reasoning: RADIAN_PURCHASE_MODULE_ARCHITECTURE.md (22 Jul 2026).

  Rules enforced here (each cites its decision):
    PUR-R01  Purchase writes NO stock quantity anywhere                DEC-PUR-002
    PUR-R02  line item must exist, be non-deleted and isPurchasable    DEC-PUR-009 / DEC-ITM-013
    PUR-R03  unit factor snapshotted at line create, never re-read     DEC-PUR-009
    PUR-R04  Σ payments ≤ grand total; pre-receive payment = advance   DEC-PUR-004
    PUR-R05  receive: partial ok, full receive → RECEIVED+receivedAt   DEC-PUR-001
    PUR-R06  RECEIVED is never deleted/cancelled — corrections=Return  DEC-PUR-006
    PUR-R07  receive recomputes item AVCO via Item's own service,
             wild jumps need confirmCost                               DEC-PUR-005
    PUR-R08  return qty ≤ received − already returned; due-cut first,
             excess → SupplierCredit; no cash refund                   DEC-PUR-006
    PUR-R09  sequential numbering PUR- / PRT-                          DEC-PUR-008
    PUR-R10  audit + timeline on every write                           core_principles
*/

const ENTITY = 'Purchase';

/** PUR-R07 — new average more than 3× away from the old one needs a confirm */
const COST_JUMP_RATIO = 3;

const purchaseInclude = {
  lines: {
    where: { deletedAt: null },
    include: {
      // isStockTracked/itemType — DEC-PUR-010 needs to know which lines OWE a movement
      item: {
        select: {
          id: true, sku: true, name: true, imageUrl: true, unitId: true,
          isStockTracked: true, itemType: true,
        },
      },
      unit: { select: { id: true, name: true, shortCode: true } },
    },
  },
  payments: { where: { deletedAt: null }, orderBy: { paidAt: 'asc' as const } },
  returns: {
    where: { deletedAt: null },
    include: { lines: { where: { deletedAt: null } } },
  },
} satisfies Prisma.PurchaseInclude;

type PurchaseRow = Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>;

function paisaMulQty(qtyMilli: number, unitPricePaisa: number): number {
  // qty is thousandths → divide once, integer maths, round half-up
  return Math.round((qtyMilli * unitPricePaisa) / 1000);
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly items: ItemsService,
    private readonly inventory: InventoryService,
    // Finance consumes received goods and bill payments — fail-soft (DEC-FIN-010)
    private readonly finance: FinanceEventsService,
    private readonly payMethods: PaymentMethodsService, // DEC-GBL-001
  ) {}

  /**
   * Receive hook (22 Jul night — Inventory is live): post PURCHASE movements
   * through InventoryService (DEC-PUR-002 consumer) and run TRUE moving AVCO
   * (DEC-INV-013): newAvg = (onHand×avg + received×price) ÷ (onHand + received),
   * onHand taken BEFORE the receipt posts. Fallback when onHand ≤ 0: the
   * received price. AUTO items keep recipe-owned cost (DEC-ITM-008).
   * Fail-soft: a failure here must never undo an already-committed receive —
   * it is flagged loudly on the purchase timeline instead.
   */
  private async afterReceive(
    purchaseId: string,
    purchaseNo: string,
    actor: string,
    receipts: { itemId: string; qtyMilliLineUnit: number; lineFactor: number; unitPricePaisaLineUnit: number; expiryDate?: string }[],
    onlyMissing = false, // DEC-PUR-010 repair pass
  ) {
    let stockPosted = false;
    try {
      // on-hand BEFORE the receipt, per item (DEC-INV-013)
      const before = new Map<string, number>();
      for (const r of receipts) {
        if (!before.has(r.itemId)) before.set(r.itemId, await this.inventory.onHandMilli(r.itemId));
      }

      const perItem = await this.inventory.postPurchaseReceipt({
        purchaseId, purchaseNo, actor, lines: receipts, onlyMissing,
      });
      // PUR-REV-9 — from here on, stock HAS posted. If the average step throws, the
      // catch must not go on claiming it did not (see below).
      stockPosted = true;

      for (const [itemId, add] of perItem) {
        if (add.addedQtyMilli <= 0) continue;
        const item = await this.prisma.db.item.findFirst({
          where: { id: itemId },
          select: { costMode: true, standardCostPaisa: true },
        });
        if (!item || item.costMode === 'AUTO') continue; // recipe owns AUTO cost
        const onHand = before.get(itemId) ?? 0;
        const oldAvg = item.standardCostPaisa;
        const newAvg =
          onHand > 0 && oldAvg > 0
            ? Math.round((onHand * oldAvg + add.addedValuePaisa * 1000) / (onHand + add.addedQtyMilli))
            : Math.round((add.addedValuePaisa * 1000) / add.addedQtyMilli);
        if (newAvg === oldAvg) continue;
        // through Item's own endpoint — DEC-ITM-008 recipe roll-up + audit fire
        await this.items.update(itemId, {
          standardCostPaisa: newAvg,
          actorName: `${actor} (moving avg from ${purchaseNo})`,
        } as never);
      }
    } catch (e) {
      /* PUR-REV-9 (30 Jul) — say which half failed. The one message used to claim
         "stock NOT updated" whichever step threw, but the movements post first and the
         average second. A failure in the average therefore told staff to go and add
         stock that was already there — an instruction that, followed, doubles it. */
      await this.audit.event({
        entityType: ENTITY,
        entityId: purchaseId,
        kind: 'system',
        label: stockPosted
          ? `⚠ Stock posted on ${purchaseNo}, but the average cost did NOT update — do not re-receive; recheck the item cost`
          : `⚠ Inventory posting failed on ${purchaseNo} — stock NOT updated, post manually`,
        actorName: actor,
        note: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * PUR-REV-1 / PUR-REV-3 (30 Jul) — the ONE place a received purchase reaches the books.
   *
   * WHAT WAS WRONG, and it was the worst thing found in this review:
   *
   * `onPurchaseReceived()` had exactly one caller — `receive()`. But a QUICK purchase
   * never goes through `receive()`: it is BORN `RECEIVED` in `create()`, because that is
   * what quick mode means ("Kamal Mama, Shahbagh bazar, goods already in the van").
   * Quick mode is the owner's normal flow. So **every quick purchase ever recorded
   * updated stock and the moving average but never wrote a journal entry** — inventory
   * value and supplier payable were both understated by the whole of it, silently, from
   * the day Finance went live.
   *
   * Nothing could have caught it from the outside: the purchase screen was right, the
   * stock board was right, the AVCO was right. Only the ledger was missing, and a
   * missing entry looks exactly like a purchase that never happened.
   *
   * Second fault, in `receive()`: the finance call sat AFTER the transaction and ignored
   * the `fullyReceived` value the transaction returned, so the FULL grand total was
   * booked the moment the FIRST box of a partial delivery arrived. The comment above it
   * said "book it once, on full receipt". It booked once, on first receipt.
   *
   * Third: it was called as `void this.finance…` — fire and forget. `safe()` swallows
   * the error into a FinancePostingFailure row, which is right, but the purchase
   * timeline never heard about it, unlike every other integration in this file. Awaited
   * and flagged now, in the same shape as `afterReceive()`.
   */
  private async postReceiptToFinance(purchaseId: string, purchaseNo: string, actor: string) {
    try {
      await this.finance.onPurchaseReceived(purchaseId);
    } catch (e) {
      await this.audit.event({
        entityType: ENTITY,
        entityId: purchaseId,
        kind: 'system',
        label: `⚠ Finance posting failed on ${purchaseNo} — not in the books, replay it from Finance`,
        actorName: actor,
        note: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /* ------------------------------------------------------------------ shape */

  private shape(p: PurchaseRow) {
    const paidPaisa = p.payments.reduce((s, x) => s + x.amountPaisa, 0);
    const dueCutPaisa = p.returns.reduce((s, r) => s + r.dueCutPaisa, 0);
    const payablePaisa = Math.max(p.grandTotalPaisa - dueCutPaisa, 0);
    const duePaisa = Math.max(payablePaisa - paidPaisa, 0);
    const orderedMilli = p.lines.reduce((s, l) => s + l.qtyMilli, 0);
    const receivedMilli = p.lines.reduce((s, l) => s + l.receivedQtyMilli, 0);
    return {
      ...p,
      paidPaisa,
      duePaisa,
      payablePaisa,
      returnedPaisa: p.returns.reduce((s, r) => s + r.totalPaisa, 0),
      // derived badge — enum stays honest (DEC-PUR-001), UI shows "Partially received"
      partiallyReceived:
        p.status !== PurchaseStatus.RECEIVED && receivedMilli > 0 && receivedMilli < orderedMilli,
      fullyReceived: p.status === PurchaseStatus.RECEIVED,
      paymentState:
        duePaisa === 0 && payablePaisa > 0
          ? 'PAID'
          : paidPaisa > 0
            ? 'PARTIAL'
            : 'UNPAID',
    };
  }

  /* ------------------------------------------------------------------ read */

  async list(q: PurchaseListQuery) {
    const where: Prisma.PurchaseWhereInput = {};
    if (q.search) {
      where.OR = [
        { purchaseNo: { contains: q.search, mode: 'insensitive' } },
        { supplierName: { contains: q.search, mode: 'insensitive' } },
        { supplierReceiptNo: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (q.status && q.status !== 'ALL' && q.status !== 'due') {
      where.status = q.status as PurchaseStatus;
    }
    if (q.from || q.to) {
      where.purchaseDate = {};
      if (q.from) where.purchaseDate.gte = new Date(q.from);
      if (q.to) where.purchaseDate.lte = new Date(q.to);
    }

    const dir: Prisma.SortOrder = q.dir === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.PurchaseOrderByWithRelationInput =
      q.sort === 'total'
        ? { grandTotalPaisa: dir }
        : q.sort === 'supplier'
          ? { supplierName: dir }
          : { purchaseDate: dir };

    /* PUR-REV-6 (30 Jul) — "due" is computed from payments and returns, so it cannot be
       expressed in the `where`. It was filtered AFTER `take: 500`, which means the list
       answered "the unpaid ones among the 500 most recent" while the screen said
       "Due". A bill from eight months ago that was never paid — exactly the one that
       matters — dropped off the list the day the 501st purchase was recorded, and
       nothing said so. Unpaid money does not age out.
       So: no ceiling when the question is about due, and the DB narrows what it can
       (a cancelled purchase is never owed). */
    const dueQuery = q.status === 'due' || q.sort === 'due';
    if (dueQuery) where.status = { not: PurchaseStatus.CANCELLED };

    const rows = await this.prisma.db.purchase.findMany({
      where,
      include: purchaseInclude,
      orderBy,
      ...(dueQuery ? {} : { take: 500 }),
    });
    /* DEC-PUR-010 — one flag, one query. Per-item gap maths is too heavy for a list,
       but "received goods and NOT one movement" is the shape every real failure took,
       and it is the difference between him noticing today and noticing at stocktake. */
    const owesStock = (r: PurchaseRow) =>
      r.status !== PurchaseStatus.CANCELLED &&
      r.lines.some(
        (l) =>
          l.receivedQtyMilli > 0 && l.item?.isStockTracked && l.item.itemType !== 'SERVICE',
      );
    const receivedIds = new Set(rows.filter(owesStock).map((r) => r.id));
    const withMovements = new Set(
      receivedIds.size
        ? (
            await this.prisma.inventoryMovement.groupBy({
              by: ['refId'],
              where: { refType: 'PURCHASE', refId: { in: [...receivedIds] } },
            })
          ).map((m) => m.refId as string)
        : [],
    );

    let shaped = rows.map((r) => ({
      ...this.shape(r),
      stockMissing: receivedIds.has(r.id) && !withMovements.has(r.id),
    }));
    if (q.status === 'due') shaped = shaped.filter((r) => r.duePaisa > 0);
    if (q.sort === 'due')
      shaped = [...shaped].sort((a, b) =>
        dir === 'asc' ? a.duePaisa - b.duePaisa : b.duePaisa - a.duePaisa,
      );
    return shaped;
  }

  /** the Overview / list header cards — server-side, never "first 100 rows" (D1 lesson) */
  async stats() {
    const rows = await this.prisma.db.purchase.findMany({
      where: { status: { not: PurchaseStatus.CANCELLED } },
      include: purchaseInclude,
    });
    const shaped = rows.map((r) => this.shape(r));
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = shaped.filter((r) => r.purchaseDate >= monthStart);
    const credits = await this.prisma.db.supplierCredit.findMany({
      where: { appliedPurchaseId: null },
    });
    return {
      totalBoughtPaisa: shaped.reduce((s, r) => s + r.grandTotalPaisa, 0),
      totalPaidPaisa: shaped.reduce((s, r) => s + r.paidPaisa, 0),
      totalDuePaisa: shaped.reduce((s, r) => s + r.duePaisa, 0),
      monthBoughtPaisa: thisMonth.reduce((s, r) => s + r.grandTotalPaisa, 0),
      monthCount: thisMonth.length,
      dueCount: shaped.filter((r) => r.duePaisa > 0).length,
      advanceWaiting: shaped
        .filter((r) => r.status === PurchaseStatus.ADVANCE_PAID)
        .map((r) => ({
          id: r.id,
          purchaseNo: r.purchaseNo,
          supplierName: r.supplierName,
          paidPaisa: r.paidPaisa,
          grandTotalPaisa: r.grandTotalPaisa,
          purchaseDate: r.purchaseDate,
        })),
      openCreditPaisa: credits.reduce((s, c) => s + c.amountPaisa, 0),
      count: shaped.length,
    };
  }

  async findOne(id: string) {
    const p = await this.prisma.db.purchase.findFirst({
      where: { id },
      include: purchaseInclude,
    });
    if (!p) throw new NotFoundException('Purchase not found');
    return { ...this.shape(p), stockGap: await this.stockGap(p) };
  }

  /**
   * DEC-PUR-010 (9 Aug 2026) — goods received, stock not moved.
   *
   * Owner: *"ami to purches krlm but stock tahole add hlo na"*. The receive hook is
   * deliberately fail-soft (a stock error must not undo a committed receipt), but
   * fail-soft used to mean the whole story lived in one timeline note. The purchase
   * screen said Received and Paid, and nothing else. So the hole is now computed on
   * every read and repaired with one button — never silently retried, because a
   * wrong automatic re-post doubles real goods.
   */
  private async stockGap(p: PurchaseRow) {
    const received = p.lines
      .filter((l) => l.receivedQtyMilli > 0)
      .map((l) => ({
        itemId: l.itemId,
        qtyMilliLineUnit: l.receivedQtyMilli,
        lineFactor: l.factorSnapshot,
      }));
    if (!received.length || p.status === PurchaseStatus.CANCELLED) return null;
    const gap = await this.inventory.purchaseReceiptGap({ purchaseId: p.id, lines: received });
    return gap.length ? gap : null;
  }

  /** DEC-PUR-010 — "Post stock now". Idempotent: posts only what is missing. */
  async repostStock(id: string, actorName?: string) {
    const actor = actorName ?? 'Admin';
    const p = await this.prisma.db.purchase.findFirst({
      where: { id },
      include: purchaseInclude,
    });
    if (!p) throw new NotFoundException('Purchase not found');
    if (p.status === PurchaseStatus.CANCELLED)
      throw new BadRequestException('This purchase is cancelled — nothing to post');

    const gap = await this.stockGap(p);
    if (!gap) throw new BadRequestException('Stock for this purchase is already posted');

    await this.afterReceive(
      id,
      p.purchaseNo,
      actor,
      p.lines
        .filter((l) => l.receivedQtyMilli > 0)
        .map((l) => ({
          itemId: l.itemId,
          qtyMilliLineUnit: l.receivedQtyMilli,
          lineFactor: l.factorSnapshot,
          unitPricePaisaLineUnit: l.unitPricePaisa,
        })),
      true,
    );

    const left = await this.stockGap(p);
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'system',
      label: left
        ? `⚠ Stock repair on ${p.purchaseNo} ran but ${left.length} item(s) are still short`
        : `Stock repaired on ${p.purchaseNo} — the missing receipt is now in stock`,
      actorName: actor,
    });
    return this.findOne(id);
  }

  timeline(id: string) {
    return this.audit.timeline(ENTITY, id);
  }

  async supplierNames(search?: string) {
    // autocomplete helper — free-text supplier discipline (DEC-PUR-003).
    // ⚠ groupBy is NOT covered by the soft-delete extension (it only wraps find*),
    // so deletedAt must be filtered explicitly here — audit fix, 22 Jul.
    const rows = await this.prisma.purchase.groupBy({
      by: ['supplierName'],
      where: {
        deletedAt: null,
        ...(search ? { supplierName: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      _count: { supplierName: true },
      orderBy: { _count: { supplierName: 'desc' } },
      take: 12,
    });
    return rows.map((r) => ({ name: r.supplierName, count: r._count.supplierName }));
  }

  /* ------------------------------------------------------------------ create */

  /**
   * PUR-R09 — sequential, DB-derived. PUR-000001 style.
   * Base client on purpose: a soft-deleted purchase must still hold its number.
   * Ordered by the NUMBER itself (zero-padded → lexicographic == numeric), not by
   * createdAt — two rows created in the same millisecond must not collide (audit fix).
   */
  private async nextNo(prefix: 'PUR' | 'PRT', skip = 0): Promise<string> {
    const field = prefix === 'PUR' ? 'purchaseNo' : 'returnNo';
    const model = prefix === 'PUR' ? this.prisma.purchase : this.prisma.purchaseReturn;
    const last = await (model as any).findFirst({
      where: { [field]: { startsWith: `${prefix}-` } },
      orderBy: { [field]: 'desc' },
      select: { [field]: true },
    });
    const lastNo: string | undefined = last?.[field];
    const n = (lastNo ? parseInt(lastNo.slice(4), 10) + 1 : 1) + skip;
    return `${prefix}-${String(n).padStart(6, '0')}`;
  }

  /**
   * PUR-REV-7 (30 Jul) — read-then-write is not atomic, so retry on the collision.
   *
   * `nextNo()` reads the highest number and adds one. Two people saving a purchase in
   * the same second both read PUR-000041 and both try to write PUR-000042; the unique
   * index refuses the second with a raw P2002, which reaches the user as a 500 and
   * loses the whole form. Rare, but the shop has three people entering bills on market
   * day, and "rare" is exactly how the singleton bug survived seven modules.
   *
   * Retrying is the right shape rather than a lock: the sequence has no meaning beyond
   * being unique and roughly increasing, so stepping over a taken number costs nothing.
   */
  private async withNextNo<T>(
    prefix: 'PUR' | 'PRT',
    write: (no: string) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        return await write(await this.nextNo(prefix, attempt));
      } catch (e) {
        const taken =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!taken || attempt === 7) throw e;
      }
    }
    /* unreachable — the loop either returns or throws */
    throw new BadRequestException('Could not allocate a document number — try again.');
  }

  async create(dto: PurchaseCreateDto) {
    const actor = dto.actorName ?? 'Admin';
    const mode = dto.mode ?? 'QUICK';
    const supplierName = (dto.supplierName ?? '').trim();
    if (!supplierName) throw new BadRequestException('Supplier name is required');
    if (!dto.lines?.length) throw new BadRequestException('At least one line is required');
    if (mode === 'ADVANCE' && (!dto.payment || dto.payment.amountPaisa <= 0)) {
      // DEC-PUR-001 — advance mode exists BECAUSE money went out first
      throw new BadRequestException('Advance mode needs an advance payment amount');
    }

    // PUR-R02 + PUR-R03 — resolve items & units once, snapshot factors
    const preparedLines = await Promise.all(
      dto.lines.map(async (l, i) => {
        const item = await this.prisma.db.item.findFirst({
          where: { id: l.itemId },
          select: { id: true, name: true, sku: true, isPurchasable: true },
        });
        if (!item) throw new BadRequestException(`Line ${i + 1}: item not found`);
        if (!item.isPurchasable) {
          throw new BadRequestException(
            `Line ${i + 1}: "${item.name}" is not purchasable (DEC-ITM-013) — flip the flag on the item first`,
          );
        }
        const unit = await this.prisma.db.unit.findFirst({ where: { id: l.unitId } });
        if (!unit) throw new BadRequestException(`Line ${i + 1}: unit not found`);
        if (!Number.isInteger(l.qtyMilli) || l.qtyMilli <= 0)
          throw new BadRequestException(`Line ${i + 1}: quantity must be a positive integer`);
        if (!Number.isInteger(l.unitPricePaisa) || l.unitPricePaisa < 0)
          throw new BadRequestException(`Line ${i + 1}: price must be a non-negative integer (paisa)`);
        const factor = await this.resolveRootFactor(l.unitId);
        return {
          itemId: l.itemId,
          unitId: l.unitId,
          factorSnapshot: factor,
          qtyMilli: l.qtyMilli,
          receivedQtyMilli: mode === 'QUICK' ? l.qtyMilli : 0,
          unitPricePaisa: l.unitPricePaisa,
          lineTotalPaisa: paisaMulQty(l.qtyMilli, l.unitPricePaisa),
        };
      }),
    );

    const subTotal = preparedLines.reduce((s, l) => s + l.lineTotalPaisa, 0);
    const discount = dto.discountPaisa ?? 0;
    if (!Number.isInteger(discount) || discount < 0 || discount > subTotal)
      throw new BadRequestException('Discount must be between 0 and the subtotal');
    // rounding/bargain adjustment — the owner's real bills land on round figures
    // (39,920 → 39,900 · 34,790 → 34,800), so it can be negative OR positive
    const adjustment = dto.adjustmentPaisa ?? 0;
    if (!Number.isInteger(adjustment))
      throw new BadRequestException('Adjustment must be an integer (paisa)');
    /*  DEC-PUR-012 (owner, 21 Aug) — a supplier bill carries VAT too, so the
        purchase screen has the same four doors as the counter. Base is what is
        left after the discount and the adjustment, exactly like DEC-POS-016.  */
    const taxRateBps = dto.taxRateBps ?? 0;
    if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000)
      throw new BadRequestException('VAT rate must be between 0 and 100 percent');
    const taxBase = Math.max(subTotal - discount + adjustment, 0);
    const vat = Math.round((taxBase * taxRateBps) / 10_000);
    const grand = taxBase + vat;
    if (grand < 0) throw new BadRequestException('Grand total cannot be negative');

    /* PUR-R04. PUR-REV-4 (30 Jul) — the amount was only ever checked against the CEILING.
       `addPayment()` validates that a payment is a positive integer; this path did not,
       so `POST /purchases { payment: { amountPaisa: -5000 } }` passed (−5000 < grand),
       and a negative payment makes `paidPaisa` negative, which inflates the due on the
       supplier statement and understates what was paid in Finance. Same rule, two doors,
       one of them open. */
    if (dto.payment) {
      if (!Number.isInteger(dto.payment.amountPaisa) || dto.payment.amountPaisa <= 0) {
        throw new BadRequestException('Payment amount must be a positive integer (paisa)');
      }
      if (dto.payment.amountPaisa > grand) {
        throw new BadRequestException('Payment cannot exceed the grand total');
      }
    }

    // PUR-R07 — check the cost jump BEFORE writing anything, so a reject leaves no orphan
    if (mode === 'QUICK') {
      await this.assertCostJumpConfirmed(preparedLines, dto.confirmCost === true);
    }

    // DEC-SUP-007 — validate the FK when given; name stays as the snapshot
    let supplierId = dto.supplierId ?? null;
    if (supplierId) {
      const sup = await this.prisma.db.supplier.findFirst({
        where: { id: supplierId },
        select: { id: true, status: true, name: true },
      });
      if (!sup) throw new BadRequestException('Supplier not found (supplierId)');
      // review fix — INACTIVE means "no new business", history untouched (SUP-R02)
      if (sup.status === 'INACTIVE')
        throw new BadRequestException(
          `"${sup.name}" is INACTIVE — reactivate the supplier before buying from him again`,
        );
    } else {
      // review fix — a purchase typed with an EXACT existing name links itself,
      // so the link tool doesn't quietly refill (only when the match is unambiguous)
      const matches = await this.prisma.db.supplier.findMany({
        where: { name: supplierName, status: 'ACTIVE' },
        select: { id: true },
        take: 2,
      });
      if (matches.length === 1) supplierId = matches[0].id;
    }

    const created = await this.withNextNo('PUR', (purchaseNo) =>
      this.prisma.db.purchase.create({
      data: {
        purchaseNo,
        status: mode === 'QUICK' ? PurchaseStatus.RECEIVED : PurchaseStatus.ADVANCE_PAID,
        supplierName,
        supplierId,
        supplierPhone: dto.supplierPhone?.trim() || null,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
        receivedAt: mode === 'QUICK' ? new Date() : null,
        supplierReceiptNo: dto.supplierReceiptNo?.trim() || null,
        attachmentUrl: dto.attachmentUrl || null,
        notes: dto.notes?.trim() || null,
        subTotalPaisa: subTotal,
        discountPaisa: discount,
        adjustmentPaisa: adjustment,
        ...({ taxRateBps, vatPaisa: vat } as object),
        grandTotalPaisa: grand,
        lines: { create: preparedLines },
        payments: dto.payment
          ? {
              create: {
                amountPaisa: dto.payment.amountPaisa,
                method: dto.payment.method as PayMethod,
                note: dto.payment.note ?? null,
              },
            }
          : undefined,
      },
      include: purchaseInclude,
      }),
    );
    const purchaseNo = created.purchaseNo;

    await this.audit.record({
      entityType: ENTITY,
      entityId: created.id,
      action: 'CREATE',
      actorName: actor,
      changes: { purchaseNo, mode, supplierName, grandTotalPaisa: grand },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: created.id,
      kind: 'general',
      label:
        mode === 'QUICK'
          ? `Purchase ${purchaseNo} recorded (received) — ${supplierName}`
          : `Advance purchase ${purchaseNo} opened — ${supplierName}`,
      actorName: actor,
    });

    // PUR-R07 + DEC-INV-013 — quick purchases are received on the spot:
    // post PURCHASE movements through Inventory + true moving average
    if (mode === 'QUICK') {
      await this.afterReceive(
        created.id,
        created.purchaseNo,
        actor,
        preparedLines.map((l) => ({
          itemId: l.itemId,
          qtyMilliLineUnit: l.qtyMilli,
          lineFactor: l.factorSnapshot,
          unitPricePaisaLineUnit: l.unitPricePaisa,
        })),
      );
      /* PUR-REV-1 — and into the books. A quick purchase is born RECEIVED, so it never
         passes through receive(), which was the ONLY caller of this. Missing since
         Finance went live. See postReceiptToFinance() for what that cost. */
      await this.postReceiptToFinance(created.id, created.purchaseNo, actor);
    }

    return this.findOne(created.id);
  }

  async update(id: string, dto: PurchasePatch) {
    const actor = dto.actorName ?? 'Admin';
    const existing = await this.findOne(id);

    /* PUR-REV-8 (30 Jul) — the name and the link have to move together.
       `supplierName` is the SNAPSHOT and `supplierId` is the LINK (DEC-SUP-007). This
       edit changed the snapshot and left the link alone, so retyping the name to a
       different supplier gave a purchase that READS "Kamal Mama" on every screen while
       the payable, the statement and the ledger all still belong to Shahbagh Traders.
       Two different answers to "who is owed this", and the screen shows the wrong one.
       Same unambiguous-match rule as create(): re-link on an exact single match, and
       otherwise drop the link rather than leave a false one. */
    let supplierId: string | null | undefined = undefined;
    const nextName = dto.supplierName?.trim();
    if (nextName && nextName !== existing.supplierName) {
      const matches = await this.prisma.db.supplier.findMany({
        where: { name: nextName, status: 'ACTIVE' },
        select: { id: true },
        take: 2,
      });
      supplierId = matches.length === 1 ? matches[0].id : null;
    }

    // header-only edits; lines are immutable after create in v1 (corrections = Return, PUR-R06)
    const updated = await this.prisma.db.purchase.update({
      where: { id },
      data: {
        supplierName: nextName || undefined,
        supplierId,
        supplierPhone: dto.supplierPhone?.trim(),
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        supplierReceiptNo: dto.supplierReceiptNo?.trim(),
        attachmentUrl: dto.attachmentUrl,
        notes: dto.notes?.trim(),
      },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName: actor,
      changes: { ...dto, actorName: undefined },
    });
    void existing;
    return this.findOne(updated.id);
  }

  /* ------------------------------------------------------------------ receive */

  async receive(id: string, dto: ReceiveDto) {
    const actor = dto.actorName ?? 'Admin';
    const p = await this.prisma.db.purchase.findFirst({
      where: { id },
      include: purchaseInclude,
    });
    if (!p) throw new NotFoundException('Purchase not found');
    if (p.status === PurchaseStatus.CANCELLED)
      throw new BadRequestException('Cannot receive a cancelled purchase');

    const wanted =
      dto.lines ??
      p.lines
        .filter((l) => l.receivedQtyMilli < l.qtyMilli)
        .map((l) => ({ lineId: l.id, qtyMilli: l.qtyMilli - l.receivedQtyMilli }));
    if (!wanted.length) throw new BadRequestException('Nothing left to receive');

    for (const w of wanted) {
      const line = p.lines.find((l) => l.id === w.lineId);
      if (!line) throw new BadRequestException('Receive line not found on this purchase');
      if (!Number.isInteger(w.qtyMilli) || w.qtyMilli <= 0)
        throw new BadRequestException('Receive quantity must be a positive integer');
      if (line.receivedQtyMilli + w.qtyMilli > line.qtyMilli)
        throw new BadRequestException(
          `Cannot receive more than ordered for "${line.item.name}" — edit the purchase line first`,
        );
    }

    await this.assertCostJumpConfirmed(
      wanted.map((w) => {
        const line = p.lines.find((l) => l.id === w.lineId)!;
        return {
          itemId: line.itemId,
          unitId: line.unitId,
          qtyMilli: w.qtyMilli,
          unitPricePaisa: line.unitPricePaisa,
          factorSnapshot: line.factorSnapshot,
          lineTotalPaisa: paisaMulQty(w.qtyMilli, line.unitPricePaisa),
        };
      }),
      dto.confirmCost === true,
    );

    /* PUR-REV-5 (30 Jul) — the over-receive check moved INSIDE the transaction.
       It used to run against `p`, read before the transaction opened, and the write is
       an `increment`. Two receive calls arriving together therefore both saw
       `received + qty <= ordered`, both passed, and both incremented — 100 ordered,
       180 received, and the AVCO weighted on quantity that never arrived. Re-reading
       the lines inside the transaction closes it; the outer check stays because it
       gives the user the item name, which this one cannot cheaply do. */
    const fullyReceived = await this.prisma.db.$transaction(async (tx) => {
      const current = await tx.purchaseLine.findMany({
        where: { purchaseId: id, deletedAt: null },
      });
      for (const w of wanted) {
        const line = current.find((l) => l.id === w.lineId);
        if (!line) throw new BadRequestException('Receive line not found on this purchase');
        if (line.receivedQtyMilli + w.qtyMilli > line.qtyMilli) {
          throw new BadRequestException(
            'Somebody received against this purchase at the same moment — reload and check what is left.',
          );
        }
        await tx.purchaseLine.update({
          where: { id: w.lineId },
          data: { receivedQtyMilli: { increment: w.qtyMilli } },
        });
      }
      const fresh = await tx.purchaseLine.findMany({
        where: { purchaseId: id, deletedAt: null },
      });
      const all = fresh.every((l) => l.receivedQtyMilli >= l.qtyMilli);
      if (all) {
        await tx.purchase.update({
          where: { id },
          data: { status: PurchaseStatus.RECEIVED, receivedAt: new Date() },
        });
      }
      return all;
    });

    /* PUR-REV-2 — ONLY on full receipt, which is what the rule always said.
       `onPurchaseReceived` books `grandTotalPaisa`, the whole bill. Firing it on the
       first of three deliveries booked the whole bill against one box, and because the
       sourceKey is `PURCHASE:<id>:received` the two later calls were silently swallowed
       as duplicates — so it never corrected itself either. */
    if (fullyReceived) {
      await this.postReceiptToFinance(id, p.purchaseNo, actor);
    }

    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName: actor,
      changes: { receive: wanted },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'general',
      label: `Goods received on ${p.purchaseNo}`,
      actorName: actor,
    });

    // PUR-R01 held its line until 22 Jul night: Purchase still writes no stock
    // ITSELF — the receive event goes THROUGH InventoryService (DEC-PUR-002
    // consumer) + true moving AVCO (DEC-INV-013).
    await this.afterReceive(
      id,
      p.purchaseNo,
      actor,
      wanted.map((w) => {
        const line = p.lines.find((l) => l.id === w.lineId)!;
        return {
          itemId: line.itemId,
          qtyMilliLineUnit: w.qtyMilli,
          lineFactor: line.factorSnapshot,
          unitPricePaisaLineUnit: line.unitPricePaisa,
        };
      }),
    );

    return this.findOne(id);
  }

  /* ------------------------------------------------------------------ payments */

  async addPayment(id: string, dto: PaymentDto) {
    const actor = dto.actorName ?? 'Admin';
    const p = await this.findOne(id);
    if (p.status === PurchaseStatus.CANCELLED)
      throw new BadRequestException('Cannot pay on a cancelled purchase');
    if (!Number.isInteger(dto.amountPaisa) || dto.amountPaisa <= 0)
      throw new BadRequestException('Payment amount must be a positive integer (paisa)');
    await this.payMethods.assertActive(dto.method); // DEC-GBL-001
    if (p.paidPaisa + dto.amountPaisa > p.payablePaisa)
      // PUR-R04 — learnt from the Sales REV bug: money never floats in the air
      throw new BadRequestException(
        `Payment exceeds what is owed — due is ${p.duePaisa} paisa`,
      );

    const pay = await this.prisma.db.purchasePayment.create({
      data: {
        purchaseId: id,
        amountPaisa: dto.amountPaisa,
        method: dto.method as PayMethod,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        note: dto.note ?? null,
      },
    });
    // DEC-FIN-022 — skipped automatically if a SupplierPayment created this row.
    // PUR-REV-3 — awaited and flagged, not fired and forgotten (see postReceiptToFinance).
    try {
      await this.finance.onPurchasePayment(pay.id);
    } catch (e) {
      await this.audit.event({
        entityType: ENTITY,
        entityId: id,
        kind: 'system',
        label: `⚠ Finance posting failed for the payment on ${p.purchaseNo} — replay it from Finance`,
        actorName: actor,
        note: e instanceof Error ? e.message : String(e),
      });
    }
    if (p.status === PurchaseStatus.ORDERED) {
      await this.prisma.db.purchase.update({
        where: { id },
        data: { status: PurchaseStatus.ADVANCE_PAID },
      });
    }
    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName: actor,
      changes: { payment: { amountPaisa: dto.amountPaisa, method: dto.method } },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'payment',
      label: `Paid ৳${(dto.amountPaisa / 100).toLocaleString()} by ${dto.method.toLowerCase()} on ${p.purchaseNo}`,
      actorName: actor,
    });
    return this.findOne(id);
  }

  /* ------------------------------------------------------------------ cancel / delete */

  async cancel(id: string, actor: string, note?: string) {
    const p = await this.findOne(id);
    // PUR-R06
    if (p.status === PurchaseStatus.RECEIVED)
      throw new BadRequestException(
        'A received purchase is never cancelled — record a Return instead (DEC-PUR-006)',
      );
    const receivedAny = p.lines.some((l) => l.receivedQtyMilli > 0);
    if (receivedAny)
      throw new BadRequestException('Goods already received on this purchase — use a Return');
    if (p.paidPaisa > 0 && !note?.trim())
      throw new BadRequestException(
        'An advance was paid — a note explaining how it was resolved is required to cancel',
      );
    await this.prisma.db.purchase.update({
      where: { id },
      data: { status: PurchaseStatus.CANCELLED, notes: note?.trim() || p.notes },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName: actor,
      changes: { cancelled: true, note },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'system',
      label: `Purchase ${p.purchaseNo} cancelled`,
      actorName: actor,
      note,
    });
    return this.findOne(id);
  }

  async remove(id: string, actor: string) {
    const p = await this.findOne(id);
    // PUR-R06 — only never-received, unpaid records may be soft-deleted
    if (p.status === PurchaseStatus.RECEIVED || p.lines.some((l) => l.receivedQtyMilli > 0))
      throw new BadRequestException('Received purchases are permanent — use a Return');
    if (p.paidPaisa > 0)
      throw new BadRequestException('Payments exist — cancel with a resolution note instead');
    await this.prisma.db.purchase.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'DELETE', actorName: actor });
    return { ok: true };
  }

  /* ------------------------------------------------------------------ returns */

  async createReturn(dto: ReturnCreateDto) {
    const actor = dto.actorName ?? 'Admin';
    const p = await this.prisma.db.purchase.findFirst({
      where: { id: dto.purchaseId },
      include: purchaseInclude,
    });
    if (!p) throw new NotFoundException('Purchase not found');
    if (!dto.lines?.length) throw new BadRequestException('Pick at least one line to return');

    // PUR-R08 — per line: qty ≤ received − already returned
    const alreadyReturned = new Map<string, number>();
    for (const r of p.returns)
      for (const rl of r.lines)
        alreadyReturned.set(
          rl.purchaseLineId,
          (alreadyReturned.get(rl.purchaseLineId) ?? 0) + rl.qtyMilli,
        );

    let total = 0;
    const prepared = dto.lines.map((rl) => {
      const line = p.lines.find((l) => l.id === rl.purchaseLineId);
      if (!line) throw new BadRequestException('Return line not on this purchase');
      if (!Number.isInteger(rl.qtyMilli) || rl.qtyMilli <= 0)
        throw new BadRequestException('Return quantity must be a positive integer');
      const returnable = line.receivedQtyMilli - (alreadyReturned.get(line.id) ?? 0);
      if (rl.qtyMilli > returnable)
        throw new BadRequestException(
          `"${line.item.name}": only ${returnable / 1000} can still be returned`,
        );
      const value = paisaMulQty(rl.qtyMilli, line.unitPricePaisa);
      total += value;
      return { purchaseLineId: line.id, qtyMilli: rl.qtyMilli, valuePaisa: value };
    });

    // DEC-PUR-006 — settlement: cut this purchase's due first, excess → credit
    const shaped = this.shape(p);
    const dueCut = Math.min(total, shaped.duePaisa);
    const credit = total - dueCut;

    const created = await this.withNextNo('PRT', (returnNo) =>
      this.prisma.db.purchaseReturn.create({
        data: {
          returnNo,
          purchaseId: p.id,
          reason: dto.reason?.trim() || null,
          totalPaisa: total,
          dueCutPaisa: dueCut,
          creditPaisa: credit,
          lines: { create: prepared },
        },
      }),
    );
    const returnNo = created.returnNo;
    if (credit > 0) {
      await this.prisma.db.supplierCredit.create({
        data: {
          supplierName: p.supplierName,
          supplierId: p.supplierId ?? null, // DEC-SUP-007 — FK carried when known
          amountPaisa: credit,
          sourceReturnId: created.id,
          note: `From return ${returnNo} on ${p.purchaseNo}`,
        },
      });
    }
    await this.audit.record({
      entityType: ENTITY,
      entityId: p.id,
      action: 'UPDATE',
      actorName: actor,
      changes: { return: { returnNo, totalPaisa: total, dueCutPaisa: dueCut, creditPaisa: credit } },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: p.id,
      kind: 'general',
      label:
        credit > 0
          ? `Return ${returnNo}: ৳${(total / 100).toLocaleString()} — ৳${(dueCut / 100).toLocaleString()} cut from the due, ৳${(credit / 100).toLocaleString()} left with the supplier`
          : `Return ${returnNo}: ৳${(total / 100).toLocaleString()} cut from the due`,
      actorName: actor,
    });

    // Return-out goes THROUGH Inventory (DEC-PUR-002 consumer / DEC-INV-002).
    // Fail-soft: the settlement above already stands — flag loudly instead of undoing.
    try {
      await this.inventory.postPurchaseReturn({
        returnId: created.id,
        returnNo,
        actor,
        lines: prepared.map((rl) => {
          const line = p.lines.find((l) => l.id === rl.purchaseLineId)!;
          return {
            itemId: line.itemId,
            qtyMilliLineUnit: rl.qtyMilli,
            lineFactor: line.factorSnapshot,
            valuePaisa: rl.valuePaisa,
          };
        }),
      });
    } catch (e) {
      await this.audit.event({
        entityType: ENTITY,
        entityId: p.id,
        kind: 'system',
        label: `⚠ Inventory posting failed on ${returnNo} — stock NOT reduced, adjust manually`,
        actorName: actor,
        note: e instanceof Error ? e.message : String(e),
      });
    }
    return this.findOne(p.id);
  }

  async listReturns() {
    const rows = await this.prisma.db.purchaseReturn.findMany({
      include: {
        purchase: { select: { id: true, purchaseNo: true, supplierName: true } },
        lines: {
          where: { deletedAt: null },
          include: {
            purchaseLine: {
              include: { item: { select: { name: true, sku: true } }, unit: true },
            },
          },
        },
      },
      orderBy: { returnDate: 'desc' },
      take: 200,
    });
    return rows;
  }

  async listCredits() {
    return this.prisma.db.supplierCredit.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  /* ------------------------------------------------------------------ AVCO (DEC-PUR-005) */

  /**
   * Phase-1 purchase-weighted average, per item, across ALL received quantities.
   * Everything is converted to BASE units via each line's factorSnapshot, then to the
   * item's own counting unit via the unit's LIVE rootFactor:
   *   avg(item unit) = Σ(lineTotal on received qty) ÷ Σ(receivedQtyMilli × factorSnapshot) × itemRootFactor
   * Upgraded to a true moving average (on-hand weighted) when Inventory ships.
   */
  private async computeAverage(itemId: string): Promise<number | null> {
    const lines = await this.prisma.db.purchaseLine.findMany({
      where: {
        itemId,
        receivedQtyMilli: { gt: 0 },
        purchase: { deletedAt: null, status: { not: PurchaseStatus.CANCELLED } },
      },
      select: {
        receivedQtyMilli: true,
        unitPricePaisa: true,
        factorSnapshot: true,
      },
    });
    if (!lines.length) return null;
    let valuePaisa = 0;
    let baseQtyMilli = 0;
    for (const l of lines) {
      valuePaisa += paisaMulQty(l.receivedQtyMilli, l.unitPricePaisa);
      baseQtyMilli += l.receivedQtyMilli * Math.max(l.factorSnapshot, 1);
    }
    if (baseQtyMilli <= 0) return null;
    const item = await this.prisma.db.item.findFirst({
      where: { id: itemId },
      select: { unitId: true },
    });
    if (!item) return null;
    const itemFactor = await this.resolveRootFactor(item.unitId);
    // avg per ONE of the item's own unit, in paisa (integer, round half-up)
    return Math.round((valuePaisa * itemFactor * 1000) / baseQtyMilli);
  }

  /**
   * PUR-R07 guardrail — reject wild jumps unless confirmed.
   * Audit fixes (22 Jul): compare only when the line's unit IS the item's counting
   * unit (comparing a papri price against a per-stick cost was a false alarm), and
   * compare against the EFFECTIVE cost — an AUTO (recipe-driven) item's
   * standardCostPaisa is stale by design (DEC-ITM-008).
   */
  private async assertCostJumpConfirmed(
    lines: { itemId: string; unitId?: string; qtyMilli: number; unitPricePaisa: number; factorSnapshot: number; lineTotalPaisa: number }[],
    confirmed: boolean,
  ) {
    if (confirmed) return;
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.itemId)) continue;
      seen.add(line.itemId);
      const item = await this.prisma.db.item.findFirst({
        where: { id: line.itemId },
        select: {
          name: true,
          unitId: true,
          costMode: true,
          standardCostPaisa: true,
          computedCostPaisa: true,
          unit: { select: { name: true } },
        },
      });
      if (!item) continue;
      const effective =
        item.costMode === 'AUTO' ? (item.computedCostPaisa ?? item.standardCostPaisa) : item.standardCostPaisa;
      if (effective <= 0) continue; // first price — nothing to compare
      // only a same-unit comparison is honest; cross-unit lines skip the guard
      if (line.unitId && line.unitId !== item.unitId) continue;
      const entered = line.unitPricePaisa;
      if (entered <= 0) continue;
      const ratio = Math.max(entered, effective) / Math.min(entered, effective);
      if (ratio > COST_JUMP_RATIO) {
        throw new BadRequestException(
          `COST_JUMP:"${item.name}" — entered price is ${ratio.toFixed(1)}× away from the current cost (৳${(
            effective / 100
          ).toLocaleString()} per ${item.unit.name}). Check the number, or confirm to proceed.`,
        );
      }
    }
  }

  /** PHASE-1 purchase-weighted average — SUPERSEDED by afterReceive()'s true
   *  moving AVCO (DEC-INV-013, 22 Jul night). Kept only as the manual-recompute
   *  fallback the timeline warns about when an Inventory post fails. */
  private async updateAverageCosts(itemIds: string[], actor: string, sourceNo: string) {
    const unique = [...new Set(itemIds)];
    for (const itemId of unique) {
      const item = await this.prisma.db.item.findFirst({
        where: { id: itemId },
        select: { standardCostPaisa: true, costMode: true },
      });
      if (!item) continue;
      // audit fix (22 Jul): an AUTO item's cost is OWNED by its recipe (DEC-ITM-008) —
      // overwriting standardCost would be dead data + audit noise. Purchase prices for
      // AUTO items still live in priceHistory; nothing is lost.
      if (item.costMode === 'AUTO') continue;
      const avg = await this.computeAverage(itemId);
      if (avg == null || item.standardCostPaisa === avg) continue;
      // DEC-PUR-005 — via Item's endpoint so DEC-ITM-008's recipe roll-up + audit fire
      await this.items.update(itemId, {
        standardCostPaisa: avg,
        actorName: `${actor} (avg from ${sourceNo})`,
      } as any);
    }
  }

  /** resolve a unit's root factor (chain-aware), matching the /units resolver */
  private async resolveRootFactor(unitId: string): Promise<number> {
    let factor = 1;
    let currentId: string | null = unitId;
    const seen = new Set<string>();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const u: { baseUnitId: string | null; baseQty: number } | null =
        await this.prisma.db.unit.findFirst({
          where: { id: currentId },
          select: { baseUnitId: true, baseQty: true },
        });
      if (!u) break;
      if (u.baseUnitId) factor *= Math.max(u.baseQty, 1);
      currentId = u.baseUnitId;
    }
    return factor;
  }

  /* ------------------------------------------------------------------ reports */

  async priceHistory(itemId: string) {
    const lines = await this.prisma.db.purchaseLine.findMany({
      where: {
        itemId,
        receivedQtyMilli: { gt: 0 },
        purchase: { deletedAt: null, status: { not: PurchaseStatus.CANCELLED } },
      },
      include: {
        purchase: { select: { purchaseNo: true, supplierName: true, purchaseDate: true } },
        unit: { select: { name: true, shortCode: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const avg = await this.computeAverage(itemId);
    return { averagePaisa: avg, lines };
  }
}
