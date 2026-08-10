import { ensureSingleton } from '../common/singleton';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MovementReason, Prisma, type InventoryMovement } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceEventsService } from '../finance/finance-events.service';
import { AuditService } from '../common/audit.service';
import { splitAcrossStores } from './split-stores'; // DEC-INV-018
import type {
  AdjustmentDto,
  IssueCreateDto,
  MovementListQuery,
  OpeningDto,
  SettingsPatch,
  StockBoardQuery,
  StocktakeCreateDto,
  TransferCreateDto,
} from './inventory.dto';

/*
  INVENTORY — service layer.
  Full architecture + decision reasoning: RADIAN_INVENTORY_MODULE_ARCHITECTURE.md (22 Jul 2026).

  Rules enforced here (each cites its decision):
    INV-RULE-001  every stock write goes through postMovements() — ONE
                  transaction: ledger + balance (+ lots). Nothing else may
                  touch InventoryStock.                          DEC-INV-001
    INV-RULE-002  ledger rows immutable — no update/delete path  DEC-INV-012
    INV-RULE-003  transfer = OUT+IN atomic, same groupId         DEC-INV-004
    INV-RULE-006  negative balances allowed, flagged, never block DEC-INV-011
    INV-RULE-007  WASTAGE/GIFT/ADJUSTMENT valued at current AVCO DEC-INV-013
    INV-RULE-008  trackExpiry items keep FEFO lots (count only)  DEC-INV-007
    INV-RULE-009  item must be non-deleted + isStockTracked      DEC-ITM-021
    INV-RULE-011  stocktake Apply → one ADJUSTMENT per diff line DEC-INV-009
    INV-RULE-012  OPENING only for untouched item×warehouse      DEC-INV-006
*/

const ENTITY = 'Inventory';
const EXPIRY_SOON_DAYS = 7;

/** interactive-transaction client. The extended (soft-delete) client's tx is
 *  structurally the same surface; call sites normalise with one contained cast. */
type Tx = Prisma.TransactionClient;
const asTx = (tx: unknown): Tx => tx as Tx;

/** stockBoard() row — explicit so empty-array inference never collapses to never[] */
type StockBoardRow = {
  itemId: string;
  sku: string | null;
  name: string;
  imageUrl: string | null;
  unitName: string;
  unitShort: string;
  assemblyMode: string;
  trackExpiry: boolean;
  reorderLevel: number | null;
  perWarehouse: { warehouseId: string; qtyMilli: number }[];
  totalQtyMilli: number;
  unitCostPaisa: number;
  valuePaisa: number;
  canBuild: number | null;
  isNegative: boolean;
  isLow: boolean;
};

type MovementDraft = {
  itemId: string;
  warehouseId: string;
  reason: MovementReason;
  qtyMilli: number; // signed
  unitCostPaisa: number;
  refType?: string;
  refId?: string;
  groupId?: string;
  note?: string;
  actor?: string;
  /** DEC-INV-007 — set on stock-IN of a trackExpiry item */
  expiryDate?: Date;
};

function valueOf(qtyMilli: number, unitCostPaisa: number): number {
  return Math.round((qtyMilli * unitCostPaisa) / 1000);
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    // Finance books wastage/gift/stocktake losses — fail-soft (DEC-FIN-010)
    private readonly finance: FinanceEventsService,
  ) {}

  /* ================================================================ core */

  /**
   * INV-RULE-001 — THE single stock writer. Ledger row + cached balance in one
   * transaction; trackExpiry items also maintain FEFO lots. Never blocks on
   * negative (INV-RULE-006, ALLOW_WARN locked).
   */
  private async postMovements(tx: Tx, drafts: MovementDraft[]) {
    // INV-RULE-006 exception branch — if the admin flips the policy to BLOCK,
    // a draft that would push a balance below zero is refused (naming the item).
    // Default stays ALLOW_WARN (DEC-INV-011): never block a live order.
    const policy = (await this.settings()).negativeStockPolicy;
    const rows: InventoryMovement[] = [];
    for (const d of drafts) {
      if (!Number.isInteger(d.qtyMilli) || d.qtyMilli === 0) {
        throw new BadRequestException('Movement qty must be a non-zero integer (qtyMilli)');
      }
      if (policy === 'BLOCK' && d.qtyMilli < 0) {
        const bal = await tx.inventoryStock.findUnique({
          where: { itemId_warehouseId: { itemId: d.itemId, warehouseId: d.warehouseId } },
          select: { qtyMilli: true },
        });
        if ((bal?.qtyMilli ?? 0) + d.qtyMilli < 0) {
          const item = await tx.item.findUnique({ where: { id: d.itemId }, select: { name: true } });
          throw new BadRequestException(
            `NEGATIVE_BLOCKED: "${item?.name ?? d.itemId}" would go below zero (policy = Block). Count and adjust first, or switch the policy in Inventory → Settings.`,
          );
        }
      }
      const row = await tx.inventoryMovement.create({
        data: {
          itemId: d.itemId,
          warehouseId: d.warehouseId,
          reason: d.reason,
          qtyMilli: d.qtyMilli,
          unitCostPaisa: d.unitCostPaisa,
          valuePaisa: valueOf(d.qtyMilli, d.unitCostPaisa),
          refType: d.refType ?? null,
          refId: d.refId ?? null,
          groupId: d.groupId ?? null,
          note: d.note ?? null,
          actor: d.actor ?? null,
        },
      });
      await tx.inventoryStock.upsert({
        where: { itemId_warehouseId: { itemId: d.itemId, warehouseId: d.warehouseId } },
        update: { qtyMilli: { increment: d.qtyMilli } },
        create: { itemId: d.itemId, warehouseId: d.warehouseId, qtyMilli: d.qtyMilli },
      });
      await this.touchLots(tx, d);
      rows.push(row);
    }
    return rows;
  }

  /** DEC-INV-007 — FEFO lots for trackExpiry items. Counts only; money stays AVCO. */
  private async touchLots(tx: Tx, d: MovementDraft) {
    const item = await tx.item.findUnique({
      where: { id: d.itemId },
      select: { trackExpiry: true },
    });
    if (!item?.trackExpiry) return;

    if (d.qtyMilli > 0) {
      if (!d.expiryDate) return; // expiry unknown → lot not tracked for this in
      const day = new Date(d.expiryDate);
      const existing = await tx.itemExpiryLot.findFirst({
        where: { itemId: d.itemId, warehouseId: d.warehouseId, expiryDate: day },
      });
      if (existing) {
        await tx.itemExpiryLot.update({
          where: { id: existing.id },
          data: { qtyMilli: { increment: d.qtyMilli } },
        });
      } else {
        await tx.itemExpiryLot.create({
          data: {
            itemId: d.itemId,
            warehouseId: d.warehouseId,
            expiryDate: day,
            qtyMilli: d.qtyMilli,
          },
        });
      }
      return;
    }

    // stock-out → consume earliest expiry first
    let remaining = -d.qtyMilli;
    const lots = await tx.itemExpiryLot.findMany({
      where: { itemId: d.itemId, warehouseId: d.warehouseId, qtyMilli: { gt: 0 } },
      orderBy: { expiryDate: 'asc' },
    });
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.qtyMilli, remaining);
      await tx.itemExpiryLot.update({
        where: { id: lot.id },
        data: { qtyMilli: { decrement: take } },
      });
      remaining -= take;
    }
    // remaining > 0 → lots exhausted (negative-stock reality) — counts stay honest at 0
  }

  /** DEC-ITM-008 — the cost a movement is valued at (per ONE of the item's unit).
   *  Public: Assembly (DEC-ASM-004) reads it too — one maths, one place. */
  effectiveCost(item: {
    costMode: string;
    standardCostPaisa: number;
    computedCostPaisa: number | null;
  }): number {
    return item.costMode === 'AUTO'
      ? (item.computedCostPaisa ?? item.standardCostPaisa)
      : item.standardCostPaisa;
  }

  /** INV-RULE-009 — the only items stock may move for. */
  private async requireMovableItem(id: string) {
    const item = await this.prisma.db.item.findFirst({
      where: { id },
      select: {
        id: true,
        name: true,
        sku: true,
        isStockTracked: true,
        itemType: true,
        trackExpiry: true,
        costMode: true,
        standardCostPaisa: true,
        computedCostPaisa: true,
      },
    });
    if (!item) throw new BadRequestException('Item not found (or deleted)');
    if (!item.isStockTracked || item.itemType === 'SERVICE') {
      throw new BadRequestException(`"${item.name}" is not stock-tracked — nothing to move`);
    }
    return item;
  }

  /** INV-RULE-012 / INV-REV-4 — an OPENING is only allowed on virgin item×warehouse */
  private async assertUntouched(tx: Tx, itemId: string, warehouseId: string, name?: string) {
    const touched = await tx.inventoryMovement.findFirst({
      where: { itemId, warehouseId },
      select: { id: true },
    });
    if (!touched) return;
    const label =
      name ?? (await tx.item.findUnique({ where: { id: itemId }, select: { name: true } }))?.name ?? itemId;
    throw new BadRequestException(
      `"${label}" already has movements in this warehouse — use Adjustment instead (INV-RULE-012)`,
    );
  }

  private async requireWarehouse(id: string) {
    const wh = await this.prisma.db.warehouse.findFirst({ where: { id, isActive: true } });
    if (!wh) throw new BadRequestException('Warehouse not found (or inactive)');
    return wh;
  }

  /**
   * INV-REV-2 (30 Jul) — allocate a document number and RETRY if somebody took it.
   *
   * `nextNo()` is read-the-highest-then-add-one, which is not atomic. Two transfers
   * saved in the same second both read TRF-000012 and both write it; the unique index
   * refuses the second as a raw P2002 and the user gets a 500 with the form lost.
   *
   * Worse here than in Purchase: `postAssemblyFinish()` allocates a WST number from
   * INSIDE a transaction that Assembly owns, so a collision does not just lose a
   * wastage note — it rolls back the entire production finish, after the flowers have
   * already been used.
   *
   * Retrying rather than locking is right: the sequence only has to be unique and
   * roughly increasing, so stepping over a number that somebody else took costs nothing.
   */
  private async withNextNo<T>(
    prefix: 'TRF' | 'WST' | 'GFT' | 'STK',
    write: (no: string) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        return await write(await this.nextNo(prefix, attempt));
      } catch (e) {
        const taken = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!taken || attempt === 7) throw e;
      }
    }
    throw new BadRequestException('Could not allocate a document number — try again.');
  }

  /** sequential doc numbers — same discipline as PUR-R09 (ordered by the number itself) */
  private async nextNo(prefix: 'TRF' | 'WST' | 'GFT' | 'STK', skip = 0): Promise<string> {
    let lastNo: string | undefined;
    if (prefix === 'TRF') {
      const last = await this.prisma.stockTransfer.findFirst({
        where: { transferNo: { startsWith: 'TRF-' } },
        orderBy: { transferNo: 'desc' },
        select: { transferNo: true },
      });
      lastNo = last?.transferNo;
    } else if (prefix === 'STK') {
      const last = await this.prisma.stocktake.findFirst({
        where: { stocktakeNo: { startsWith: 'STK-' } },
        orderBy: { stocktakeNo: 'desc' },
        select: { stocktakeNo: true },
      });
      lastNo = last?.stocktakeNo;
    } else {
      const last = await this.prisma.stockIssue.findFirst({
        where: { issueNo: { startsWith: `${prefix}-` } },
        orderBy: { issueNo: 'desc' },
        select: { issueNo: true },
      });
      lastNo = last?.issueNo;
    }
    const n = (lastNo ? parseInt(lastNo.slice(4), 10) + 1 : 1) + skip;
    return `${prefix}-${String(n).padStart(6, '0')}`;
  }

  /* ====================================================== event consumers
     DEC-PUR-002: Purchase never writes stock — it calls these. DEC-INV-015
     stage 1: Delivery's preparing calls postSaleForOrder in PARALLEL with the
     legacy Product.stockQty write; callers fail-soft so the live path never
     breaks on an inventory error. */

  /** total on-hand across warehouses, in the item's OWN unit (milli) */
  async onHandMilli(itemId: string): Promise<number> {
    const agg = await this.prisma.db.inventoryStock.aggregate({
      where: { itemId },
      _sum: { qtyMilli: true },
    });
    return agg._sum.qtyMilli ?? 0;
  }

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * DEC-INV-016 — a shop always has somewhere to put things
   *
   * Owner, 9 Aug 2026: he recorded PUR-000001 (20 Paper, 50 Sunflower, ৳12,000
   * paid), and the timeline said *"Inventory posting failed — No active
   * warehouse, run the inventory seed"*. His words: *"tahole to gora thekei
   * gondogol."* He is right.
   *
   * ⚠️ "Run the seed" is a developer instruction wearing an error message. A
   * shop owner receiving goods should never meet it — and a purchase that is
   * marked Received and Paid while the stock silently goes nowhere is the
   * worst possible outcome: the money moved and the goods did not.
   *
   * So the first receive CREATES the store instead of refusing. One row,
   * code SHOP, named "Main store" — renameable in Inventory → Warehouses like
   * anything else. Only ever created when there is genuinely none; the moment
   * one exists this never runs again.
   * ─────────────────────────────────────────────────────────────────────────
   */
  private async ensureWarehouseId(): Promise<string> {
    const first = await this.prisma.db.warehouse.findFirst({ where: { isActive: true } });
    if (first) return first.id;
    /*  ⚠️ Deleted-but-present is a real case: `code` is unique, so a plain
        create would collide with a soft-deleted SHOP row. Revive it instead.  */
    const dormant = await this.prisma.warehouse.findFirst({ where: { code: 'SHOP' } });
    if (dormant) {
      const back = await this.prisma.warehouse.update({
        where: { id: dormant.id },
        data: { isActive: true, deletedAt: null },
      });
      return back.id;
    }
    const made = await this.prisma.db.warehouse.create({
      data: { code: 'SHOP', name: 'Main store', isActive: true },
    });
    return made.id;
  }

  private async receiveWarehouseId(): Promise<string> {
    const s = await this.settings();
    if (s.defaultReceiveWarehouseId) return s.defaultReceiveWarehouseId;
    return this.ensureWarehouseId();
  }

  private async saleWarehouseId(): Promise<string> {
    const s = await this.settings();
    if (s.defaultSaleWarehouseId) return s.defaultSaleWarehouseId;
    return this.receiveWarehouseId();
  }

  /**
   * Purchase receive → PURCHASE movements (INV-RULE-001 path). Quantities come
   * in the purchase LINE's unit; converted to the item's own unit via root
   * factors (UOM ruling — never multiply by hand elsewhere).
   * Returns per-item added qty/value so the caller can run DEC-INV-013 AVCO.
   */
  async postPurchaseReceipt(params: {
    purchaseId: string;
    purchaseNo: string;
    actor: string;
    lines: {
      itemId: string;
      qtyMilliLineUnit: number;
      lineFactor: number; // factorSnapshot (DEC-PUR-009)
      unitPricePaisaLineUnit: number;
      expiryDate?: string;
    }[];
    /** DEC-PUR-010 repair pass — post only what this purchase has not posted yet. */
    onlyMissing?: boolean;
  }): Promise<Map<string, { addedQtyMilli: number; addedValuePaisa: number }>> {
    const warehouseId = await this.receiveWarehouseId();
    const perItem = new Map<string, { addedQtyMilli: number; addedValuePaisa: number }>();
    const drafts: MovementDraft[] = [];

    for (const l of params.lines) {
      if (l.qtyMilliLineUnit <= 0) continue;
      const item = await this.prisma.db.item.findFirst({
        where: { id: l.itemId },
        select: { id: true, unitId: true, isStockTracked: true, itemType: true, trackExpiry: true },
      });
      if (!item || !item.isStockTracked || item.itemType === 'SERVICE') continue;

      const itemFactor = await this.resolveRootFactor(item.unitId);
      const qtyItemMilli = Math.round((l.qtyMilliLineUnit * Math.max(l.lineFactor, 1)) / Math.max(itemFactor, 1));
      if (qtyItemMilli <= 0) continue;
      const valuePaisa = Math.round((l.qtyMilliLineUnit * l.unitPricePaisaLineUnit) / 1000);
      const unitCostItem = Math.round((valuePaisa * 1000) / qtyItemMilli);

      drafts.push({
        itemId: l.itemId,
        warehouseId,
        reason: 'PURCHASE',
        qtyMilli: qtyItemMilli,
        unitCostPaisa: unitCostItem,
        refType: 'PURCHASE',
        refId: params.purchaseId,
        note: params.purchaseNo,
        actor: params.actor,
        expiryDate: item.trackExpiry && l.expiryDate ? new Date(l.expiryDate) : undefined,
      });
      const agg = perItem.get(l.itemId) ?? { addedQtyMilli: 0, addedValuePaisa: 0 };
      agg.addedQtyMilli += qtyItemMilli;
      agg.addedValuePaisa += valuePaisa;
      perItem.set(l.itemId, agg);
    }

    const toPost = params.onlyMissing
      ? await this.trimAlreadyPosted(params.purchaseId, drafts, perItem)
      : drafts;

    if (toPost.length) {
      await this.prisma.db.$transaction(async (raw) => this.postMovements(asTx(raw), toPost));
    }
    return perItem;
  }

  /**
   * DEC-PUR-010 — the hole between what a purchase received and what actually
   * reached stock, per item, WITHOUT writing anything. Purchase asks this on every
   * read so a silent posting failure shows up on the screen instead of only in the
   * timeline note nobody scrolls to.
   */
  async purchaseReceiptGap(params: {
    purchaseId: string;
    lines: { itemId: string; qtyMilliLineUnit: number; lineFactor: number }[];
  }): Promise<{ itemId: string; name: string; missingMilli: number }[]> {
    const expected = new Map<string, { qty: number; name: string }>();
    for (const l of params.lines) {
      if (l.qtyMilliLineUnit <= 0) continue;
      const item = await this.prisma.db.item.findFirst({
        where: { id: l.itemId },
        select: { id: true, name: true, unitId: true, isStockTracked: true, itemType: true },
      });
      if (!item || !item.isStockTracked || item.itemType === 'SERVICE') continue;
      const itemFactor = await this.resolveRootFactor(item.unitId);
      const qty = Math.round((l.qtyMilliLineUnit * Math.max(l.lineFactor, 1)) / Math.max(itemFactor, 1));
      if (qty <= 0) continue;
      const agg = expected.get(l.itemId) ?? { qty: 0, name: item.name };
      agg.qty += qty;
      expected.set(l.itemId, agg);
    }
    if (!expected.size) return [];

    const posted = await this.purchasePostedByItem(params.purchaseId);
    const gap: { itemId: string; name: string; missingMilli: number }[] = [];
    for (const [itemId, e] of expected) {
      const missing = e.qty - (posted.get(itemId) ?? 0);
      if (missing > 0) gap.push({ itemId, name: e.name, missingMilli: missing });
    }
    return gap;
  }

  /**
   * DEC-PUR-010 — what a purchase has ALREADY put into stock, per item.
   * Movements are never soft-deleted, so the raw sum is the truth.
   */
  async purchasePostedByItem(purchaseId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.inventoryMovement.groupBy({
      by: ['itemId'],
      where: { refType: 'PURCHASE', refId: purchaseId },
      _sum: { qtyMilli: true },
    });
    return new Map(rows.map((r) => [r.itemId, r._sum.qtyMilli ?? 0]));
  }

  /**
   * Repair pass. Drops the part of `drafts` that is already standing in stock for
   * this purchase, so pressing "Post stock now" twice cannot double the goods.
   * `perItem` is trimmed in step so the caller's AVCO weighs only what really moved.
   */
  private async trimAlreadyPosted(
    purchaseId: string,
    drafts: MovementDraft[],
    perItem: Map<string, { addedQtyMilli: number; addedValuePaisa: number }>,
  ): Promise<MovementDraft[]> {
    const posted = await this.purchasePostedByItem(purchaseId);
    if (!posted.size) return drafts;

    const budget = new Map<string, number>();
    for (const [itemId, agg] of perItem) {
      budget.set(itemId, Math.max(agg.addedQtyMilli - (posted.get(itemId) ?? 0), 0));
    }

    const kept: MovementDraft[] = [];
    const moved = new Map<string, { addedQtyMilli: number; addedValuePaisa: number }>();
    for (const d of drafts) {
      const left = budget.get(d.itemId) ?? 0;
      if (left <= 0) continue;
      const qty = Math.min(d.qtyMilli, left);
      budget.set(d.itemId, left - qty);
      kept.push(qty === d.qtyMilli ? d : { ...d, qtyMilli: qty });
      const agg = moved.get(d.itemId) ?? { addedQtyMilli: 0, addedValuePaisa: 0 };
      agg.addedQtyMilli += qty;
      agg.addedValuePaisa += Math.round((qty * d.unitCostPaisa) / 1000);
      moved.set(d.itemId, agg);
    }

    perItem.clear();
    for (const [itemId, agg] of moved) perItem.set(itemId, agg);
    return kept;
  }

  /** Purchase return → PURCHASE_RETURN stock-out (valued at the return's own figures) */
  async postPurchaseReturn(params: {
    returnId: string;
    returnNo: string;
    actor: string;
    lines: { itemId: string; qtyMilliLineUnit: number; lineFactor: number; valuePaisa: number }[];
  }): Promise<void> {
    const warehouseId = await this.receiveWarehouseId();
    const drafts: MovementDraft[] = [];
    for (const l of params.lines) {
      if (l.qtyMilliLineUnit <= 0) continue;
      const item = await this.prisma.db.item.findFirst({
        where: { id: l.itemId },
        select: { id: true, unitId: true, isStockTracked: true, itemType: true },
      });
      if (!item || !item.isStockTracked || item.itemType === 'SERVICE') continue;
      const itemFactor = await this.resolveRootFactor(item.unitId);
      const qtyItemMilli = Math.round((l.qtyMilliLineUnit * Math.max(l.lineFactor, 1)) / Math.max(itemFactor, 1));
      if (qtyItemMilli <= 0) continue;
      drafts.push({
        itemId: l.itemId,
        warehouseId,
        reason: 'PURCHASE_RETURN',
        qtyMilli: -qtyItemMilli,
        unitCostPaisa: Math.round((l.valuePaisa * 1000) / qtyItemMilli),
        refType: 'PURCHASE_RETURN',
        refId: params.returnId,
        note: params.returnNo,
        actor: params.actor,
      });
    }
    if (drafts.length) {
      await this.prisma.db.$transaction(async (raw) => this.postMovements(asTx(raw), drafts));
    }
  }

  /**
   * DEC-INV-015 stage 1 + DEC-ITM-004 branch: Delivery "preparing" (direction -1)
   * or a stock revert on cancel (direction +1).
   *   NONE / MAKE_TO_STOCK → the finished item moves
   *   MAKE_TO_ORDER       → the RECIPE components move (factor discipline)
   * Products without an itemId are skipped — flagged in the returned notes.
   */
  async postSaleForOrder(params: {
    orderId: string;
    orderNo: string;
    actor: string;
    direction: 1 | -1;
    lines: { productId: string; qty: number }[];
  }): Promise<{ posted: number; skipped: string[] }> {
    const warehouseId = await this.saleWarehouseId();
    const drafts: MovementDraft[] = [];
    const skipped: string[] = [];
    const noteBase = params.direction === -1 ? params.orderNo : `${params.orderNo} · stock revert`;

    for (const l of params.lines) {
      if (l.qty <= 0) continue;
      const product = await this.prisma.db.product.findFirst({
        where: { id: l.productId },
        select: { id: true, name: true, itemId: true },
      });
      if (!product?.itemId) {
        skipped.push(product?.name ?? l.productId);
        continue;
      }
      const item = await this.prisma.db.item.findFirst({
        where: { id: product.itemId },
        select: {
          id: true, name: true, unitId: true, isStockTracked: true, itemType: true,
          assemblyMode: true, costMode: true, standardCostPaisa: true, computedCostPaisa: true,
          components: {
            where: { deletedAt: null, isOptional: false },
            select: { componentItemId: true, qtyMilli: true, unitId: true },
          },
        },
      });
      if (!item || !item.isStockTracked || item.itemType === 'SERVICE') {
        skipped.push(product.name);
        continue;
      }

      if (item.assemblyMode === 'MAKE_TO_ORDER') {
        for (const c of item.components) {
          const comp = await this.prisma.db.item.findFirst({
            where: { id: c.componentItemId },
            select: {
              id: true, unitId: true, isStockTracked: true, itemType: true,
              costMode: true, standardCostPaisa: true, computedCostPaisa: true,
            },
          });
          if (!comp || !comp.isStockTracked || comp.itemType === 'SERVICE') continue;
          const lineFactor = await this.resolveRootFactor(c.unitId);
          const compFactor = await this.resolveRootFactor(comp.unitId);
          const perOneMilli = Math.round((c.qtyMilli * lineFactor) / Math.max(compFactor, 1));
          const qtyMilli = perOneMilli * l.qty;
          if (qtyMilli <= 0) continue;
          drafts.push({
            itemId: comp.id,
            warehouseId,
            reason: 'SALE',
            qtyMilli: params.direction * qtyMilli,
            unitCostPaisa: this.effectiveCost(comp),
            refType: 'ORDER',
            refId: params.orderId,
            note: `${noteBase} · ${item.name}`,
            actor: params.actor,
          });
        }
      } else {
        const qtyMilli = l.qty * 1000; // one product unit = one item unit (DEC-ITM-002)
        drafts.push({
          itemId: item.id,
          warehouseId,
          reason: 'SALE',
          qtyMilli: params.direction * qtyMilli,
          unitCostPaisa: this.effectiveCost(item),
          refType: 'ORDER',
          refId: params.orderId,
          note: noteBase,
          actor: params.actor,
        });
      }
    }

    const final =
      params.direction === -1
        ? await this.takeFromWhereverItIs(drafts)
        : await this.mirrorOriginalSale(params.orderId, drafts);

    if (final.length) {
      await this.prisma.db.$transaction(async (raw) => this.postMovements(asTx(raw), final));
    }
    return { posted: final.length, skipped };
  }

  /* ───────────────────────────────────────────────── DEC-INV-018 (10 Aug 2026)
     Sell from where the goods actually are.

     Owner's question: *"sales deduct krbe dhoro storeroom theke but main store a
     stock ache — sale atke jabe naki?"*

     Before this, the answer was ugly. The shop counts stock across ALL stores, so
     the page said IN STOCK 50; the sale then deducted from the ONE default store,
     drove it to −1, and never touched the 50 sitting next door. The sale went
     through (right), but the ledger claimed a shortage that did not exist (wrong),
     and only a human noticing the red row would ever fix it.

     `Block below zero` is not the answer either — it refuses a sale for goods the
     shop is holding. That is the worse mistake.

     His ruling: take from the default store first, then from whichever store has
     the rest. The movement note says where it came from, so the ledger reads like
     what really happened. Nothing is ever blocked: if every store is dry, the
     remainder still lands on the default and goes negative — which is now an
     honest shortage rather than a bookkeeping artefact.
     ───────────────────────────────────────────────────────────────────────── */
  private async takeFromWhereverItIs(drafts: MovementDraft[]): Promise<MovementDraft[]> {
    const out: MovementDraft[] = [];
    /*  একই item দুই line-এ থাকলে দ্বিতীয়টা যেন প্রথমটার কাটা মাল আবার না গোনে  */
    const spent = new Map<string, number>();

    for (const d of drafts) {
      if (d.qtyMilli >= 0) { out.push(d); continue; }

      const held = await this.prisma.db.inventoryStock.findMany({
        where: { itemId: d.itemId, qtyMilli: { gt: 0 }, warehouse: { isActive: true } },
        select: { warehouseId: true, qtyMilli: true, warehouse: { select: { name: true } } },
      });

      const takes = splitAcrossStores(
        -d.qtyMilli,
        held.map((h) => ({
          warehouseId: h.warehouseId,
          name: h.warehouse.name,
          freeMilli: h.qtyMilli - (spent.get(`${d.itemId}:${h.warehouseId}`) ?? 0),
        })),
        d.warehouseId,
      );

      for (const t of takes) {
        spent.set(`${d.itemId}:${t.warehouseId}`, (spent.get(`${d.itemId}:${t.warehouseId}`) ?? 0) + t.takeMilli);
        out.push({
          ...d,
          warehouseId: t.warehouseId,
          qtyMilli: -t.takeMilli,
          note: t.name ? `${d.note ?? ''} · from ${t.name}`.trim() : d.note,
        });
      }
    }
    return out;
  }

  /**
   * DEC-INV-018 — a cancel must put the goods back in the store they LEFT.
   * The ledger already knows: read this order's own SALE movements instead of
   * guessing the default, otherwise cancelling quietly moves stock between stores.
   */
  private async mirrorOriginalSale(orderId: string, drafts: MovementDraft[]): Promise<MovementDraft[]> {
    const taken = await this.prisma.inventoryMovement.groupBy({
      by: ['itemId', 'warehouseId'],
      where: { refType: 'ORDER', refId: orderId, reason: 'SALE', qtyMilli: { lt: 0 } },
      _sum: { qtyMilli: true },
    });
    if (!taken.length) return drafts;

    const out: MovementDraft[] = [];
    for (const d of drafts) {
      if (d.qtyMilli <= 0) { out.push(d); continue; }
      const rows = taken.filter((t) => t.itemId === d.itemId);
      if (!rows.length) { out.push(d); continue; }

      let left = d.qtyMilli;
      for (const r of rows) {
        if (left <= 0) break;
        const give = Math.min(-(r._sum.qtyMilli ?? 0), left);
        if (give <= 0) continue;
        left -= give;
        out.push({ ...d, warehouseId: r.warehouseId, qtyMilli: give });
      }
      if (left > 0) out.push({ ...d, qtyMilli: left });
    }
    return out;
  }

  /**
   * DEC-RTN-007 + INV-RULE-001 — restock goods coming back on a post-delivery
   * return. ONLY the lines the staff marked RESTOCK reach here (WRITE_OFF lines
   * never call this). Reason SALE_RETURN, +stock. Same item resolution as a sale
   * so MAKE_TO_ORDER products put their recipe components back. Products without
   * an itemId are skipped (flagged), exactly like postSaleForOrder.
   */
  async postSaleReturn(params: {
    returnId: string;
    returnNo: string;
    actor: string;
    lines: { productId: string; qty: number }[];
  }): Promise<{ posted: number; skipped: string[] }> {
    const warehouseId = await this.saleWarehouseId();
    const drafts: MovementDraft[] = [];
    const skipped: string[] = [];
    const noteBase = `${params.returnNo} · sale return`;

    for (const l of params.lines) {
      if (l.qty <= 0) continue;
      const product = await this.prisma.db.product.findFirst({
        where: { id: l.productId },
        select: { id: true, name: true, itemId: true },
      });
      if (!product?.itemId) {
        skipped.push(product?.name ?? l.productId);
        continue;
      }
      const item = await this.prisma.db.item.findFirst({
        where: { id: product.itemId },
        select: {
          id: true, name: true, unitId: true, isStockTracked: true, itemType: true,
          assemblyMode: true, costMode: true, standardCostPaisa: true, computedCostPaisa: true,
          components: {
            where: { deletedAt: null, isOptional: false },
            select: { componentItemId: true, qtyMilli: true, unitId: true },
          },
        },
      });
      if (!item || !item.isStockTracked || item.itemType === 'SERVICE') {
        skipped.push(product.name);
        continue;
      }

      if (item.assemblyMode === 'MAKE_TO_ORDER') {
        for (const c of item.components) {
          const comp = await this.prisma.db.item.findFirst({
            where: { id: c.componentItemId },
            select: {
              id: true, unitId: true, isStockTracked: true, itemType: true,
              costMode: true, standardCostPaisa: true, computedCostPaisa: true,
            },
          });
          if (!comp || !comp.isStockTracked || comp.itemType === 'SERVICE') continue;
          const lineFactor = await this.resolveRootFactor(c.unitId);
          const compFactor = await this.resolveRootFactor(comp.unitId);
          const perOneMilli = Math.round((c.qtyMilli * lineFactor) / Math.max(compFactor, 1));
          const qtyMilli = perOneMilli * l.qty;
          if (qtyMilli <= 0) continue;
          drafts.push({
            itemId: comp.id,
            warehouseId,
            reason: 'SALE_RETURN',
            qtyMilli: qtyMilli, // +stock back
            unitCostPaisa: this.effectiveCost(comp),
            refType: 'SALE_RETURN',
            refId: params.returnId,
            note: `${noteBase} · ${item.name}`,
            actor: params.actor,
          });
        }
      } else {
        const qtyMilli = l.qty * 1000; // one product unit = one item unit (DEC-ITM-002)
        drafts.push({
          itemId: item.id,
          warehouseId,
          reason: 'SALE_RETURN',
          qtyMilli: qtyMilli,
          unitCostPaisa: this.effectiveCost(item),
          refType: 'SALE_RETURN',
          refId: params.returnId,
          note: noteBase,
          actor: params.actor,
        });
      }
    }

    if (drafts.length) {
      await this.prisma.db.$transaction(async (raw) => this.postMovements(asTx(raw), drafts));
    }
    return { posted: drafts.length, skipped };
  }

  /* ------------------------------------------------------------- assembly v2
     RADIAN_ASSEMBLY_MODULE_ARCHITECTURE.md (redesigned 23 Jul 2026,
     DEC-ASM-011…016). Assembly never touches InventoryStock — it creates its
     documents in ITS OWN transaction and hands that tx here (ASM-RULE-002).

     The WIP stage IS a warehouse (DEC-ASM-012): "Assembly floor" (ASSEMBLY).
       start   → components TRANSFER source → floor
       finish  → used consumed (ASSEMBLY out of floor) · wasted → WASTAGE
                 StockIssue (DEC-ASM-015) · leftovers TRANSFER floor → source
       transfer→ finished item ASSEMBLY in at the destination
       cancel  → picked components TRANSFER floor → source
     Every stage is plain ledger movements — double inventory is impossible. */

  /** DEC-ASM-012 — the Assembly floor warehouse; lazily created on first use. */
  async assemblyFloorWarehouseId(): Promise<string> {
    const s = await this.settings();
    if (s.assemblyFloorWarehouseId) {
      const wh = await this.prisma.db.warehouse.findFirst({
        where: { id: s.assemblyFloorWarehouseId, isActive: true },
      });
      if (wh) return wh.id;
    }
    /* INV-REV-3 (30 Jul) — THE NINTH SINGLETON, missed by the 29 Jul sweep.
       This was `findFirst → create`, the exact shape `common/singleton.ts` exists to
       kill. It survived the sweep because that pass grepped for *Setting accessors and
       this one is a WAREHOUSE, so it did not match the shape anybody was looking for.
       `Warehouse.code` is @unique, so two assembly runs starting together both saw no
       floor, both inserted, and the second died on P2002 — rolling back a whole
       production start. Assembly is exactly where two people press Start at once. */
    const floor = await ensureSingleton(
      () => this.prisma.db.warehouse.findFirst({ where: { code: 'ASSEMBLY' } }),
      () => this.prisma.warehouse.create({ data: { code: 'ASSEMBLY', name: 'Assembly floor' } }),
    );
    await this.prisma.inventorySetting.update({
      where: { id: 'singleton' },
      data: { assemblyFloorWarehouseId: floor.id },
    });
    return floor.id;
  }

  /** DEC-ASM-003 — Assembly's default warehouses, fallback chain to SHOP. */
  async assemblyWarehouseDefaults(): Promise<{
    componentWarehouseId: string;
    finishedWarehouseId: string;
    floorWarehouseId: string;
  }> {
    const s = await this.settings();
    const fallback = async () => {
      if (s.defaultSaleWarehouseId) return s.defaultSaleWarehouseId;
      //  DEC-INV-016 — same rule: make the store rather than refuse the work
      return this.ensureWarehouseId();
    };
    const fb = await fallback();
    return {
      componentWarehouseId: s.defaultAssemblyComponentWarehouseId ?? fb,
      finishedWarehouseId: s.defaultAssemblyFinishedWarehouseId ?? fb,
      floorWarehouseId: await this.assemblyFloorWarehouseId(),
    };
  }

  /** production start — components move source → Assembly floor (one groupId). */
  async postAssemblyPick(
    rawTx: unknown,
    params: {
      productionId: string;
      productionNo: string;
      actor: string;
      sourceWarehouseId: string;
      floorWarehouseId: string;
      components: { itemId: string; qtyMilli: number; unitCostPaisa: number }[];
    },
  ): Promise<void> {
    const tx = asTx(rawTx);
    const drafts: MovementDraft[] = [];
    for (const c of params.components) {
      if (c.qtyMilli <= 0) continue;
      drafts.push(
        {
          itemId: c.itemId,
          warehouseId: params.sourceWarehouseId,
          reason: 'TRANSFER',
          qtyMilli: -c.qtyMilli,
          unitCostPaisa: c.unitCostPaisa,
          refType: 'PRODUCTION',
          refId: params.productionId,
          groupId: params.productionId,
          note: `${params.productionNo} · to assembly floor`,
          actor: params.actor,
        },
        {
          itemId: c.itemId,
          warehouseId: params.floorWarehouseId,
          reason: 'TRANSFER',
          qtyMilli: c.qtyMilli,
          unitCostPaisa: c.unitCostPaisa,
          refType: 'PRODUCTION',
          refId: params.productionId,
          groupId: params.productionId,
          note: `${params.productionNo} · to assembly floor`,
          actor: params.actor,
        },
      );
    }
    if (drafts.length) await this.postMovements(tx, drafts);
  }

  /**
   * production finish — used consumed off the floor, wasted becomes a REAL
   * WASTAGE StockIssue (DEC-ASM-015 — lands in the money reports), leftovers
   * go back to the source warehouse. Finished pieces do NOT enter the ledger
   * yet: their item is chosen at transfer (DEC-ASM-011).
   */
  async postAssemblyFinish(
    rawTx: unknown,
    params: {
      productionId: string;
      productionNo: string;
      actor: string;
      sourceWarehouseId: string;
      floorWarehouseId: string;
      components: {
        itemId: string;
        pickedQtyMilli: number;
        usedQtyMilli: number;
        wastedQtyMilli: number;
        unitCostPaisa: number;
      }[];
    },
  ): Promise<{ issueId: string | null; wastedValuePaisa: number }> {
    const tx = asTx(rawTx);
    const drafts: MovementDraft[] = [];

    for (const c of params.components) {
      if (c.usedQtyMilli > 0) {
        drafts.push({
          itemId: c.itemId,
          warehouseId: params.floorWarehouseId,
          reason: 'ASSEMBLY',
          qtyMilli: -c.usedQtyMilli,
          unitCostPaisa: c.unitCostPaisa,
          refType: 'PRODUCTION',
          refId: params.productionId,
          groupId: params.productionId,
          note: `${params.productionNo} · consumed`,
          actor: params.actor,
        });
      }
      const leftover = c.pickedQtyMilli - c.usedQtyMilli - c.wastedQtyMilli;
      if (leftover > 0) {
        drafts.push(
          {
            itemId: c.itemId,
            warehouseId: params.floorWarehouseId,
            reason: 'TRANSFER',
            qtyMilli: -leftover,
            unitCostPaisa: c.unitCostPaisa,
            refType: 'PRODUCTION',
            refId: params.productionId,
            groupId: params.productionId,
            note: `${params.productionNo} · leftover back`,
            actor: params.actor,
          },
          {
            itemId: c.itemId,
            warehouseId: params.sourceWarehouseId,
            reason: 'TRANSFER',
            qtyMilli: leftover,
            unitCostPaisa: c.unitCostPaisa,
            refType: 'PRODUCTION',
            refId: params.productionId,
            groupId: params.productionId,
            note: `${params.productionNo} · leftover back`,
            actor: params.actor,
          },
        );
      }
    }
    if (drafts.length) await this.postMovements(tx, drafts);

    const wastedLines = params.components
      .filter((c) => c.wastedQtyMilli > 0)
      .map((c) => ({
        itemId: c.itemId,
        qtyMilli: c.wastedQtyMilli,
        unitCostPaisa: c.unitCostPaisa,
        valuePaisa: valueOf(c.wastedQtyMilli, c.unitCostPaisa),
      }));
    if (!wastedLines.length) return { issueId: null, wastedValuePaisa: 0 };

    const totalValuePaisa = wastedLines.reduce((s, x) => s + x.valuePaisa, 0);
    /* INV-REV-2 — inside Assembly's transaction, so a P2002 here would roll back a
       finished production. `withNextNo` cannot retry across somebody else's tx, so the
       number is probed against the raw client first and the create still sits in the
       caller's transaction; a clash re-reads and steps over it. */
    const issueNo = await this.withNextNo('WST', async (no) => {
      const taken = await this.prisma.stockIssue.findUnique({
        where: { issueNo: no }, select: { id: true },
      });
      if (taken) {
        throw new Prisma.PrismaClientKnownRequestError('issueNo taken', {
          code: 'P2002', clientVersion: 'inv-rev-2',
        });
      }
      return no;
    });
    const issue = await tx.stockIssue.create({
      data: {
        issueNo,
        kind: 'WASTAGE',
        warehouseId: params.floorWarehouseId,
        reason: 'Production',
        note: params.productionNo,
        totalValuePaisa,
        actor: params.actor,
        lines: { create: wastedLines },
      },
    });
    await this.postMovements(
      tx,
      wastedLines.map((l) => ({
        itemId: l.itemId,
        warehouseId: params.floorWarehouseId,
        reason: 'WASTAGE' as MovementReason,
        qtyMilli: -l.qtyMilli,
        unitCostPaisa: l.unitCostPaisa,
        refType: 'ISSUE',
        refId: issue.id,
        note: `Production ${params.productionNo}`,
        actor: params.actor,
      })),
    );
    return { issueId: issue.id, wastedValuePaisa: totalValuePaisa };
  }

  /** transfer — the finished item finally enters the ledger (DEC-ASM-011). */
  async postAssemblyTransfer(
    rawTx: unknown,
    params: {
      productionId: string;
      productionNo: string;
      actor: string;
      targetItemId: string;
      warehouseId: string;
      qtyMilli: number;
      unitCostPaisa: number;
    },
  ): Promise<void> {
    await this.postMovements(asTx(rawTx), [
      {
        itemId: params.targetItemId,
        warehouseId: params.warehouseId,
        reason: 'ASSEMBLY',
        qtyMilli: params.qtyMilli,
        unitCostPaisa: params.unitCostPaisa,
        refType: 'PRODUCTION',
        refId: params.productionId,
        groupId: params.productionId,
        note: `${params.productionNo} · finished goods in`,
        actor: params.actor,
      },
    ]);
  }

  /** cancel — everything picked goes back floor → source. */
  async postAssemblyReturn(
    rawTx: unknown,
    params: {
      productionId: string;
      productionNo: string;
      actor: string;
      sourceWarehouseId: string;
      floorWarehouseId: string;
      components: { itemId: string; qtyMilli: number; unitCostPaisa: number }[];
    },
  ): Promise<void> {
    const tx = asTx(rawTx);
    const drafts: MovementDraft[] = [];
    for (const c of params.components) {
      if (c.qtyMilli <= 0) continue;
      drafts.push(
        {
          itemId: c.itemId,
          warehouseId: params.floorWarehouseId,
          reason: 'TRANSFER',
          qtyMilli: -c.qtyMilli,
          unitCostPaisa: c.unitCostPaisa,
          refType: 'PRODUCTION',
          refId: params.productionId,
          groupId: params.productionId,
          note: `${params.productionNo} · cancelled, back to shelf`,
          actor: params.actor,
        },
        {
          itemId: c.itemId,
          warehouseId: params.sourceWarehouseId,
          reason: 'TRANSFER',
          qtyMilli: c.qtyMilli,
          unitCostPaisa: c.unitCostPaisa,
          refType: 'PRODUCTION',
          refId: params.productionId,
          groupId: params.productionId,
          note: `${params.productionNo} · cancelled, back to shelf`,
          actor: params.actor,
        },
      );
    }
    if (drafts.length) await this.postMovements(tx, drafts);
  }

  /* ================================================================ reads */

  async warehouses() {
    return this.prisma.db.warehouse.findMany({ orderBy: { createdAt: 'asc' } });
  }

  /* ─────────────────────────────────────────────────────────── warehouses
     DEC-INV-017 (10 Aug 2026) — the owner can finally make his own stores.

     Owner: *"amk abr blo amr inevntory add hoy nai karon amr gudam ar setup
     kri nai"* — and he was half right. Stock could not land because there was
     no warehouse; but there was also **no way for him to make one**. The seed
     never ran on his database, the API only read, and no screen existed. He was
     blamed for not doing something the system never let him do.

     Every rule below is his ruling, 10 Aug:
       · two stores are the normal shape — goods land in the storeroom, sales
         leave from the shop, Transfer moves between them
       · closing a store that still holds goods is REFUSED, not warned: those
         goods would vanish from the count and the money figure would lie.
     ───────────────────────────────────────────────────────────────────── */

  /** shouty, no spaces — it is a key people type, not a sentence */
  private normaliseCode(raw: string): string {
    const code = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '_');
    if (!/^[A-Z0-9_-]{2,16}$/.test(code)) {
      throw new BadRequestException(
        'Short code: 2-16 characters, letters/numbers/underscore only (e.g. SHOP, STORE, UTTARA)',
      );
    }
    return code;
  }

  async createWarehouse(dto: { code: string; name: string; address?: string; actorName?: string }) {
    const actor = dto.actorName ?? 'Admin';
    const code = this.normaliseCode(dto.code);
    const name = (dto.name ?? '').trim();
    if (name.length < 2) throw new BadRequestException('Give the store a name');

    /*  code is unique across deleted rows too — revive rather than collide,
        the same trap ensureWarehouseId() fell into (DEC-INV-016).            */
    const existing = await this.prisma.warehouse.findUnique({ where: { code } });
    if (existing && !existing.deletedAt) {
      throw new BadRequestException(`"${code}" is already used by ${existing.name}`);
    }
    const row = existing
      ? await this.prisma.warehouse.update({
          where: { id: existing.id },
          data: { name, address: dto.address ?? null, isActive: true, deletedAt: null },
        })
      : await this.prisma.db.warehouse.create({
          data: { code, name, address: dto.address ?? null, isActive: true },
        });

    await this.audit.record({
      entityType: 'Warehouse', entityId: row.id, action: 'CREATE', actorName: actor,
      changes: { code, name, address: dto.address ?? null },
    });
    return row;
  }

  async updateWarehouse(
    id: string,
    patch: { name?: string; address?: string | null; isActive?: boolean; actorName?: string },
  ) {
    const actor = patch.actorName ?? 'Admin';
    const wh = await this.prisma.db.warehouse.findFirst({ where: { id } });
    if (!wh) throw new NotFoundException('Warehouse not found');

    if (patch.isActive === false && wh.isActive) await this.assertClosable(wh);

    const name = patch.name !== undefined ? patch.name.trim() : wh.name;
    if (name.length < 2) throw new BadRequestException('Give the store a name');

    const row = await this.prisma.db.warehouse.update({
      where: { id },
      data: {
        name,
        address: patch.address !== undefined ? patch.address : wh.address,
        isActive: patch.isActive ?? wh.isActive,
      },
    });
    await this.audit.record({
      entityType: 'Warehouse', entityId: id, action: 'UPDATE', actorName: actor,
      changes: { before: { name: wh.name, address: wh.address, isActive: wh.isActive }, after: row },
    });
    return row;
  }

  /** soft delete — history never disappears (core rule 5) */
  async deleteWarehouse(id: string, actorName?: string) {
    const actor = actorName ?? 'Admin';
    const wh = await this.prisma.db.warehouse.findFirst({ where: { id } });
    if (!wh) throw new NotFoundException('Warehouse not found');
    await this.assertClosable(wh);

    const moved = await this.prisma.inventoryMovement.count({ where: { warehouseId: id } });
    if (moved > 0) {
      /*  একবার ledger-এ নাম উঠে গেলে সারি মুছলে পুরনো movement অনাথ হয়ে যায়।  */
      throw new BadRequestException(
        `"${wh.name}" already has ${moved} stock movement(s) in its history — close it instead of deleting, so the old records still make sense`,
      );
    }
    await this.prisma.db.warehouse.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.record({
      entityType: 'Warehouse', entityId: id, action: 'DELETE', actorName: actor,
      changes: { code: wh.code, name: wh.name },
    });
    return { ok: true };
  }

  /**
   * ওনার রায় (১০ আগস্ট): মাল রেখে গুদাম বন্ধ করা যাবে না — সতর্ক করে নয়,
   * সরাসরি আটকে। কারণ বন্ধ গুদামের মাল হিসাব থেকে উবে যায়, আর তখন টাকার
   * অঙ্কটাই মিথ্যা বলে।
   */
  private async assertClosable(wh: { id: string; name: string }) {
    const held = await this.prisma.inventoryStock.findMany({
      where: { warehouseId: wh.id, NOT: { qtyMilli: 0 } },
      include: { item: { select: { name: true } } },
      take: 4,
    });
    if (held.length) {
      const names = held
        .map((h) => `${h.item.name} ${(h.qtyMilli / 1000).toLocaleString('en-US')}`)
        .join(', ');
      throw new BadRequestException(
        `"${wh.name}" still holds stock (${names}) — move it out with a Transfer first, then close`,
      );
    }

    const others = await this.prisma.db.warehouse.count({
      where: { isActive: true, NOT: { id: wh.id } },
    });
    if (others === 0) {
      throw new BadRequestException(
        `"${wh.name}" is the only store left — the shop must have somewhere to put things. Make another one first`,
      );
    }

    const s = await this.settings();
    const uses = [
      s.defaultSaleWarehouseId === wh.id && 'sales deduct from it',
      s.defaultReceiveWarehouseId === wh.id && 'purchases receive into it',
      s.defaultAssemblyComponentWarehouseId === wh.id && 'assembly takes components from it',
      s.defaultAssemblyFinishedWarehouseId === wh.id && 'assembly puts finished goods in it',
    ].filter(Boolean);
    if (uses.length) {
      throw new BadRequestException(
        `"${wh.name}" is still in use — ${uses.join(' and ')}. Point Inventory → Settings somewhere else first`,
      );
    }
  }

  async settings() {
    // ensureSingleton — survives two requests creating this row at once (P2002)
    return ensureSingleton(
      () => this.prisma.inventorySetting.findUnique({ where: { id: 'singleton' } }),
      () => this.prisma.inventorySetting.create({ data: { id: 'singleton' } }),
    );
  }

  async updateSettings(patch: SettingsPatch) {
    const actor = patch.actorName ?? 'Admin';
    const s = await this.settings();
    const updated = await this.prisma.inventorySetting.update({
      where: { id: 'singleton' },
      data: {
        defaultSaleWarehouseId: patch.defaultSaleWarehouseId ?? s.defaultSaleWarehouseId,
        defaultReceiveWarehouseId:
          patch.defaultReceiveWarehouseId ?? s.defaultReceiveWarehouseId,
        allowPerOrderWarehouse: patch.allowPerOrderWarehouse ?? s.allowPerOrderWarehouse,
        negativeStockPolicy: (patch.negativeStockPolicy ?? s.negativeStockPolicy) as never,
        // DEC-ASM-003 — explicit null clears back to the fallback chain
        defaultAssemblyComponentWarehouseId:
          patch.defaultAssemblyComponentWarehouseId !== undefined
            ? patch.defaultAssemblyComponentWarehouseId
            : s.defaultAssemblyComponentWarehouseId,
        defaultAssemblyFinishedWarehouseId:
          patch.defaultAssemblyFinishedWarehouseId !== undefined
            ? patch.defaultAssemblyFinishedWarehouseId
            : s.defaultAssemblyFinishedWarehouseId,
        assemblyFloorWarehouseId:
          patch.assemblyFloorWarehouseId !== undefined
            ? patch.assemblyFloorWarehouseId
            : s.assemblyFloorWarehouseId,
      },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: 'settings',
      action: 'UPDATE',
      actorName: actor,
      changes: patch as Record<string, unknown>,
    });
    return updated;
  }

  /**
   * Stock board — one row per stock-tracked item: per-warehouse qty, AVCO value,
   * low/negative flags, "can build N" for MAKE_TO_ORDER (DEC-INV-010).
   */
  async stockBoard(q: StockBoardQuery): Promise<StockBoardRow[]> {
    const search = (q.search ?? '').trim();
    const items = await this.prisma.db.item.findMany({
      where: {
        isStockTracked: true,
        itemType: { not: 'SERVICE' },
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        sku: true,
        name: true,
        imageUrl: true,
        assemblyMode: true,
        trackExpiry: true,
        reorderLevel: true,
        costMode: true,
        standardCostPaisa: true,
        computedCostPaisa: true,
        unit: { select: { name: true, shortCode: true } },
        components: {
          where: { deletedAt: null, isOptional: false },
          select: { componentItemId: true, qtyMilli: true, unitId: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const stocks = await this.prisma.db.inventoryStock.findMany({});
    const byItem = new Map<string, { warehouseId: string; qtyMilli: number }[]>();
    for (const s of stocks) {
      const list = byItem.get(s.itemId) ?? [];
      list.push({ warehouseId: s.warehouseId, qtyMilli: s.qtyMilli });
      byItem.set(s.itemId, list);
    }

    const factorCache = new Map<string, number>();
    const resolveFactor = async (unitId: string) => {
      const hit = factorCache.get(unitId);
      if (hit !== undefined) return hit;
      const f = await this.resolveRootFactor(unitId);
      factorCache.set(unitId, f);
      return f;
    };

    const rows: StockBoardRow[] = [];
    for (const item of items) {
      const per = byItem.get(item.id) ?? [];
      const totalMilli = per.reduce((s, x) => s + x.qtyMilli, 0);
      const cost = this.effectiveCost(item);
      const isMto = item.assemblyMode === 'MAKE_TO_ORDER';

      // DEC-INV-010 — can build N = min(component stock ÷ recipe qty), unit-aware
      let canBuild: number | null = null;
      if (isMto && item.components.length) {
        let minBuilds = Number.POSITIVE_INFINITY;
        for (const c of item.components) {
          const compStocks = byItem.get(c.componentItemId) ?? [];
          const compTotal = compStocks.reduce((s, x) => s + x.qtyMilli, 0);
          // Component stock is kept in the component item's OWN unit; the recipe
          // line may use a different (chain-related) unit. Convert through the
          // root: qtyInCompUnit = lineQty × lineRootFactor ÷ compUnitRootFactor
          // (UOM ruling — both resolve to the same root by construction).
          const lineFactor = await resolveFactor(c.unitId);
          const compUnitFactor = await this.componentOwnUnitFactor(c.componentItemId, factorCache);
          const needMilli = Math.round((c.qtyMilli * lineFactor) / Math.max(compUnitFactor, 1));
          if (needMilli <= 0) continue;
          const builds = Math.floor(Math.max(compTotal, 0) / needMilli);
          minBuilds = Math.min(minBuilds, builds);
        }
        canBuild = Number.isFinite(minBuilds) ? minBuilds : 0;
      }

      const lowAt = item.reorderLevel != null ? item.reorderLevel * 1000 : null;
      rows.push({
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        imageUrl: item.imageUrl,
        unitName: item.unit.name,
        unitShort: item.unit.shortCode,
        assemblyMode: item.assemblyMode,
        trackExpiry: item.trackExpiry,
        reorderLevel: item.reorderLevel,
        perWarehouse: per,
        totalQtyMilli: totalMilli,
        unitCostPaisa: cost,
        valuePaisa: valueOf(totalMilli, cost),
        canBuild,
        isNegative: per.some((x) => x.qtyMilli < 0),
        isLow: !isMto && lowAt != null && totalMilli <= lowAt,
      });
    }

    const filter = q.filter ?? 'all';
    const filtered =
      filter === 'low'
        ? rows.filter((r) => r.isLow)
        : filter === 'negative'
          ? rows.filter((r) => r.isNegative)
          : rows;
    return filtered;
  }

  /** the component item's own counting-unit root factor (cached) */
  private async componentOwnUnitFactor(
    componentItemId: string,
    cache: Map<string, number>,
  ): Promise<number> {
    const comp = await this.prisma.db.item.findFirst({
      where: { id: componentItemId },
      select: { unitId: true },
    });
    if (!comp) return 1;
    const hit = cache.get(comp.unitId);
    if (hit !== undefined) return hit;
    const f = await this.resolveRootFactor(comp.unitId);
    cache.set(comp.unitId, f);
    return f;
  }

  /** chain-aware root factor — same resolver discipline as /units and Purchase.
   *  Public: Assembly's recipe conversion (ASM-RULE-003) uses this same resolver. */
  async resolveRootFactor(unitId: string): Promise<number> {
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

  async movements(q: MovementListQuery) {
    const take = Math.min(parseInt(q.take ?? '200', 10) || 200, 500);
    const days = parseInt(q.days ?? '0', 10) || 0;
    return this.prisma.db.inventoryMovement.findMany({
      where: {
        ...(q.itemId ? { itemId: q.itemId } : {}),
        ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}),
        ...(q.reason ? { reason: q.reason as MovementReason } : {}),
        ...(days > 0
          ? { createdAt: { gte: new Date(Date.now() - days * 24 * 3600 * 1000) } }
          : {}),
      },
      include: {
        item: { select: { sku: true, name: true, imageUrl: true } },
        warehouse: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /** itemStockLabel() data source — DEC-ITM-005 addendum */
  async itemStock(itemId: string) {
    const item = await this.prisma.db.item.findFirst({
      where: { id: itemId },
      select: { id: true, assemblyMode: true, isStockTracked: true, itemType: true },
    });
    if (!item) throw new NotFoundException('Item not found');
    if (!item.isStockTracked || item.itemType === 'SERVICE') {
      return { mode: 'NA' as const, perWarehouse: [], totalQtyMilli: 0, canBuild: null };
    }
    const board = await this.stockBoard({});
    const row = board.find((r) => r.itemId === itemId);
    if (!row) return { mode: 'NONE' as const, perWarehouse: [], totalQtyMilli: 0, canBuild: null };
    return {
      mode: item.assemblyMode === 'MAKE_TO_ORDER' ? ('CAN_BUILD' as const) : ('STOCK' as const),
      perWarehouse: row.perWarehouse,
      totalQtyMilli: row.totalQtyMilli,
      canBuild: row.canBuild,
    };
  }

  /* ================================================================ flows */

  /** DEC-INV-006 / INV-RULE-012 — Opening: only for untouched item×warehouse. */
  async opening(dto: OpeningDto) {
    const actor = dto.actorName ?? 'Admin';
    if (!dto.lines?.length) throw new BadRequestException('At least one line is required');

    // INV-RULE-012 also within one submission: two lines for the same
    // item×warehouse would both pass the "untouched" check, then double-post.
    const seen = new Set<string>();
    for (const l of dto.lines) {
      const key = `${l.itemId}:${l.warehouseId}`;
      if (seen.has(key)) {
        throw new BadRequestException('The same item appears twice for one warehouse — merge the lines');
      }
      seen.add(key);
    }

    const drafts: MovementDraft[] = [];
    for (const l of dto.lines) {
      if (l.qtyMilli <= 0) throw new BadRequestException('Opening qty must be positive');
      const item = await this.requireMovableItem(l.itemId);
      await this.requireWarehouse(l.warehouseId);
      await this.assertUntouched(this.prisma.db as unknown as Tx, l.itemId, l.warehouseId, item.name);
      drafts.push({
        itemId: l.itemId,
        warehouseId: l.warehouseId,
        reason: 'OPENING',
        qtyMilli: l.qtyMilli,
        unitCostPaisa: this.effectiveCost(item),
        note: dto.note,
        actor,
        expiryDate: l.expiryDate ? new Date(l.expiryDate) : undefined,
      });
    }

    /* INV-REV-4 (30 Jul) — check it AGAIN inside the transaction.
       The loop above checks and the post happens later, so two opening submissions for
       the same item×warehouse arriving together both saw "untouched" and both posted —
       opening stock counted twice, and OPENING is the one movement there is no honest
       way to reverse (INV-RULE-012 forbids a second one, so the correction has to be an
       Adjustment that looks like a real discrepancy for ever).
       The file already knew this hazard: the `seen` set above guards the same clash
       WITHIN one submission. It just did not guard it across two. */
    const rows = await this.prisma.db.$transaction(async (raw) => {
      const tx = asTx(raw);
      for (const d of drafts) {
        await this.assertUntouched(tx, d.itemId, d.warehouseId);
      }
      return this.postMovements(tx, drafts);
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: 'opening',
      kind: 'general',
      label: `Opening stock: ${rows.length} item(s)`,
      actorName: actor,
      note: dto.note,
    });
    return { posted: rows.length };
  }

  /** DEC-INV-004 / INV-RULE-003 — one-step transfer, OUT+IN one transaction. */
  async createTransfer(dto: TransferCreateDto) {
    const actor = dto.actorName ?? 'Admin';
    if (!dto.lines?.length) throw new BadRequestException('At least one line is required');
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('From and To warehouse must differ');
    }
    await this.requireWarehouse(dto.fromWarehouseId);
    await this.requireWarehouse(dto.toWarehouseId);

    const items = new Map<string, Awaited<ReturnType<typeof this.requireMovableItem>>>();
    for (const l of dto.lines) {
      if (l.qtyMilli <= 0) throw new BadRequestException('Transfer qty must be positive');
      items.set(l.itemId, await this.requireMovableItem(l.itemId));
    }

    // INV-REV-2 — the number is allocated INSIDE the retry, so a clash re-runs the
    // whole transaction with the next free one instead of 500-ing.
    const created = await this.withNextNo('TRF', (transferNo) =>
      this.prisma.db.$transaction(async (raw) => {
      const tx = asTx(raw);
      const doc = await tx.stockTransfer.create({
        data: {
          transferNo,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          note: dto.note ?? null,
          actor,
          lines: {
            create: dto.lines.map((l) => ({ itemId: l.itemId, qtyMilli: l.qtyMilli })),
          },
        },
      });
      const drafts: MovementDraft[] = [];
      for (const l of dto.lines) {
        const cost = this.effectiveCost(items.get(l.itemId)!);
        drafts.push(
          {
            itemId: l.itemId,
            warehouseId: dto.fromWarehouseId,
            reason: 'TRANSFER',
            qtyMilli: -l.qtyMilli,
            unitCostPaisa: cost,
            refType: 'TRANSFER',
            refId: doc.id,
            groupId: doc.id,
            actor,
          },
          {
            itemId: l.itemId,
            warehouseId: dto.toWarehouseId,
            reason: 'TRANSFER',
            qtyMilli: l.qtyMilli,
            unitCostPaisa: cost,
            refType: 'TRANSFER',
            refId: doc.id,
            groupId: doc.id,
            actor,
          },
        );
      }
      await this.postMovements(tx, drafts);
      return doc;
      }),
    );

    await this.audit.event({
      entityType: ENTITY,
      entityId: created.id,
      kind: 'general',
      label: `Transfer ${created.transferNo}: ${dto.lines.length} item(s)`,
      actorName: actor,
      note: dto.note,
    });
    return this.getTransfer(created.id);
  }

  async listTransfers() {
    return this.prisma.db.stockTransfer.findMany({
      include: {
        lines: { include: { item: { select: { sku: true, name: true, imageUrl: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getTransfer(id: string) {
    const t = await this.prisma.db.stockTransfer.findFirst({
      where: { id },
      include: {
        lines: { include: { item: { select: { sku: true, name: true, imageUrl: true } } } },
      },
    });
    if (!t) throw new NotFoundException('Transfer not found');
    return t;
  }

  /** DEC-INV-005 / INV-RULE-007 — wastage & gift, valued at current AVCO. */
  async createIssue(dto: IssueCreateDto) {
    const actor = dto.actorName ?? 'Admin';
    if (!dto.lines?.length) throw new BadRequestException('At least one line is required');
    await this.requireWarehouse(dto.warehouseId);
    if (dto.kind !== 'WASTAGE' && dto.kind !== 'GIFT') {
      throw new BadRequestException('kind must be WASTAGE or GIFT');
    }

    const lineRows: { itemId: string; qtyMilli: number; unitCostPaisa: number; valuePaisa: number }[] = [];
    for (const l of dto.lines) {
      if (l.qtyMilli <= 0) throw new BadRequestException('Issue qty must be positive');
      const item = await this.requireMovableItem(l.itemId);
      const cost = this.effectiveCost(item);
      lineRows.push({
        itemId: l.itemId,
        qtyMilli: l.qtyMilli,
        unitCostPaisa: cost,
        valuePaisa: valueOf(l.qtyMilli, cost),
      });
    }
    const totalValuePaisa = lineRows.reduce((s, x) => s + x.valuePaisa, 0);

    const created = await this.withNextNo(dto.kind === 'WASTAGE' ? 'WST' : 'GFT', (issueNo) =>
      this.prisma.db.$transaction(async (raw) => {
      const tx = asTx(raw);
      const doc = await tx.stockIssue.create({
        data: {
          issueNo,
          kind: dto.kind,
          warehouseId: dto.warehouseId,
          reason: dto.reason ?? null,
          note: dto.note ?? null,
          totalValuePaisa,
          actor,
          lines: { create: lineRows },
        },
      });
      await this.postMovements(
        tx,
        lineRows.map((l) => ({
          itemId: l.itemId,
          warehouseId: dto.warehouseId,
          reason: dto.kind as MovementReason,
          qtyMilli: -l.qtyMilli,
          unitCostPaisa: l.unitCostPaisa,
          refType: 'ISSUE',
          refId: doc.id,
          note: dto.reason,
          actor,
        })),
      );
      return doc;
      }),
    );

    await this.audit.event({
      entityType: ENTITY,
      entityId: created.id,
      kind: 'general',
      label: `${dto.kind === 'WASTAGE' ? 'Wastage' : 'Gift'} ${created.issueNo}: ৳${(totalValuePaisa / 100).toLocaleString()}`,
      actorName: actor,
      note: dto.reason,
    });

    /* Spoiled or given away — the value leaves stock and becomes a cost.
       INV-REV-1 (30 Jul) — awaited and flagged, not `void`. This call moves MONEY: a
       wastage that never reaches the ledger overstates profit by exactly the flowers
       that rotted, which is the one number the owner most needs to be true. `safe()`
       writes a FinancePostingFailure row, but nothing put it in front of anybody, so a
       silent failure looked identical to a wastage that cost nothing. Same fault, same
       fix, as PUR-REV-3. */
    try {
      await this.finance.onStockIssue(created.id);
    } catch (e) {
      await this.audit.event({
        entityType: ENTITY,
        entityId: created.id,
        kind: 'system',
        label: `⚠ Finance posting failed for ${created.issueNo} — the loss is NOT in the books, replay it from Finance`,
        actorName: actor,
        note: e instanceof Error ? e.message : String(e),
      });
    }
    return this.getIssue(created.id);
  }

  async listIssues(kind?: string) {
    return this.prisma.db.stockIssue.findMany({
      where: kind === 'WASTAGE' || kind === 'GIFT' ? { kind: kind as never } : {},
      include: {
        lines: { include: { item: { select: { sku: true, name: true, imageUrl: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getIssue(id: string) {
    const doc = await this.prisma.db.stockIssue.findFirst({
      where: { id },
      include: {
        lines: { include: { item: { select: { sku: true, name: true, imageUrl: true } } } },
      },
    });
    if (!doc) throw new NotFoundException('Issue not found');
    return doc;
  }

  /** quick single-item fix — ADJUSTMENT, signed delta */
  async adjust(dto: AdjustmentDto) {
    const actor = dto.actorName ?? 'Admin';
    const item = await this.requireMovableItem(dto.itemId);
    await this.requireWarehouse(dto.warehouseId);
    if (!dto.deltaQtyMilli) throw new BadRequestException('deltaQtyMilli must be non-zero');
    const rows = await this.prisma.db.$transaction(async (raw) =>
      this.postMovements(asTx(raw), [
        {
          itemId: dto.itemId,
          warehouseId: dto.warehouseId,
          reason: 'ADJUSTMENT',
          qtyMilli: dto.deltaQtyMilli,
          unitCostPaisa: this.effectiveCost(item),
          note: dto.note,
          actor,
        },
      ]),
    );
    await this.audit.event({
      entityType: ENTITY,
      entityId: rows[0].id,
      kind: 'general',
      label: `Adjustment: ${item.name} ${dto.deltaQtyMilli > 0 ? '+' : ''}${dto.deltaQtyMilli / 1000}`,
      actorName: actor,
      note: dto.note,
    });
    return rows[0];
  }

  /* ---------------------------------------------------------- stocktake */

  /** DEC-INV-009 — create a DRAFT session; ledger qty snapshotted now. */
  async createStocktake(dto: StocktakeCreateDto) {
    const actor = dto.actorName ?? 'Admin';
    if (!dto.lines?.length) throw new BadRequestException('At least one line is required');
    await this.requireWarehouse(dto.warehouseId);

    const lines: { itemId: string; ledgerQtyMilli: number; countedQtyMilli: number; diffValuePaisa: number }[] = [];
    for (const l of dto.lines) {
      const item = await this.requireMovableItem(l.itemId);
      const stock = await this.prisma.db.inventoryStock.findFirst({
        where: { itemId: l.itemId, warehouseId: dto.warehouseId },
      });
      const ledger = stock?.qtyMilli ?? 0;
      const cost = this.effectiveCost(item);
      lines.push({
        itemId: l.itemId,
        ledgerQtyMilli: ledger,
        countedQtyMilli: l.countedQtyMilli,
        diffValuePaisa: valueOf(l.countedQtyMilli - ledger, cost),
      });
    }

    const doc = await this.withNextNo('STK', (stocktakeNo) =>
      this.prisma.db.stocktake.create({
        data: {
          stocktakeNo,
          warehouseId: dto.warehouseId,
          note: dto.note ?? null,
          actor,
          lines: { create: lines },
        },
        include: { lines: true },
      }),
    );
    await this.audit.event({
      entityType: ENTITY,
      entityId: doc.id,
      kind: 'general',
      label: `Stocktake ${doc.stocktakeNo} started (${lines.length} items)`,
      actorName: actor,
    });
    return doc;
  }

  /** INV-RULE-011 — Apply: one ADJUSTMENT per differing line; session then immutable. */
  async applyStocktake(id: string, actorName?: string) {
    const actor = actorName ?? 'Admin';
    const doc = await this.prisma.db.stocktake.findFirst({
      where: { id },
      include: { lines: true },
    });
    if (!doc) throw new NotFoundException('Stocktake not found');
    if (doc.status === 'APPLIED') throw new BadRequestException('Already applied (immutable)');

    const drafts: MovementDraft[] = [];
    for (const l of doc.lines) {
      const diff = l.countedQtyMilli - l.ledgerQtyMilli;
      if (diff === 0) continue;
      const item = await this.requireMovableItem(l.itemId);
      drafts.push({
        itemId: l.itemId,
        warehouseId: doc.warehouseId,
        reason: 'ADJUSTMENT',
        qtyMilli: diff,
        unitCostPaisa: this.effectiveCost(item),
        refType: 'STOCKTAKE',
        refId: doc.id,
        groupId: doc.id,
        note: `Stocktake ${doc.stocktakeNo}`,
        actor,
      });
    }

    await this.prisma.db.$transaction(async (raw) => {
      const tx = asTx(raw);
      if (drafts.length) await this.postMovements(tx, drafts);
      await tx.stocktake.update({
        where: { id },
        data: { status: 'APPLIED', appliedAt: new Date() },
      });
    });

    await this.audit.event({
      entityType: ENTITY,
      entityId: doc.id,
      kind: 'general',
      label: `Stocktake ${doc.stocktakeNo} applied — ${drafts.length} adjustment(s)`,
      actorName: actor,
    });
    return this.getStocktake(id);
  }

  async listStocktakes() {
    return this.prisma.db.stocktake.findMany({
      include: { lines: { include: { item: { select: { sku: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getStocktake(id: string) {
    const doc = await this.prisma.db.stocktake.findFirst({
      where: { id },
      include: {
        lines: { include: { item: { select: { sku: true, name: true, imageUrl: true } } } },
      },
    });
    if (!doc) throw new NotFoundException('Stocktake not found');
    return doc;
  }

  /* ================================================================ boards */

  /** Overview — decision-first: what needs attention, then the numbers. */
  async overview() {
    const board = await this.stockBoard({});
    const negative = board.filter((r) => r.isNegative);
    const low = board.filter((r) => r.isLow);
    const totalValuePaisa = board.reduce((s, r) => s + Math.max(r.valuePaisa, 0), 0);

    const soon = new Date(Date.now() + EXPIRY_SOON_DAYS * 24 * 3600 * 1000);
    const expiring = await this.prisma.db.itemExpiryLot.findMany({
      where: { qtyMilli: { gt: 0 }, expiryDate: { lte: soon } },
      include: { item: { select: { sku: true, name: true, imageUrl: true } } },
      orderBy: { expiryDate: 'asc' },
      take: 20,
    });

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
    const issues = await this.prisma.db.stockIssue.findMany({
      where: { createdAt: { gte: monthStart }, status: 'POSTED' },
      select: { kind: true, totalValuePaisa: true, createdAt: true },
    });
    const sum = (rows: typeof issues) => rows.reduce((s, x) => s + x.totalValuePaisa, 0);
    const todayIssues = issues.filter((i) => i.createdAt >= dayStart);

    const movementsToday = await this.prisma.db.inventoryMovement.count({
      where: { createdAt: { gte: dayStart } },
    });

    return {
      needsAttention: {
        negative: negative.slice(0, 10),
        negativeCount: negative.length,
        low: low.slice(0, 10),
        lowCount: low.length,
        expiring,
      },
      kpis: {
        totalValuePaisa,
        itemCount: board.length,
        wastageTodayPaisa: sum(todayIssues.filter((i) => i.kind === 'WASTAGE')),
        wastageMonthPaisa: sum(issues.filter((i) => i.kind === 'WASTAGE')),
        giftMonthPaisa: sum(issues.filter((i) => i.kind === 'GIFT')),
        movementsToday,
      },
    };
  }

  /** Reports — wastage/gift money by day + valuation snapshot. */
  /*  A window, not just a length — same correction as ProductsService.analytics.
      Taking only a day count meant nothing could ask about a past period, so
      Intelligence's Wastage report was labelling "the last N days to today"
      with whatever dates the reader had picked. Found in the 29 Jul review.
      `issueReport(30)` still means the last 30 days; `issueReport({from, to})`
      means exactly that window. */
  async issueReport(window: number | { from: Date; to: Date } = 30) {
    const from = typeof window === 'number'
      ? new Date(Date.now() - window * 24 * 3600 * 1000)
      : new Date(window.from);
    from.setHours(0, 0, 0, 0);
    const until = typeof window === 'number' ? undefined : window.to;
    const days = typeof window === 'number'
      ? window
      : Math.max(1, Math.round((window.to.getTime() - from.getTime()) / 86400000));
    const issues = await this.prisma.db.stockIssue.findMany({
      where: { createdAt: until ? { gte: from, lte: until } : { gte: from }, status: 'POSTED' },
      select: { kind: true, totalValuePaisa: true, reason: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const byDay = new Map<string, { wastagePaisa: number; giftPaisa: number }>();
    for (const i of issues) {
      const key = i.createdAt.toISOString().slice(0, 10);
      const row = byDay.get(key) ?? { wastagePaisa: 0, giftPaisa: 0 };
      if (i.kind === 'WASTAGE') row.wastagePaisa += i.totalValuePaisa;
      else row.giftPaisa += i.totalValuePaisa;
      byDay.set(key, row);
    }
    return {
      days,
      series: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
      totalWastagePaisa: issues
        .filter((i) => i.kind === 'WASTAGE')
        .reduce((s, x) => s + x.totalValuePaisa, 0),
      totalGiftPaisa: issues
        .filter((i) => i.kind === 'GIFT')
        .reduce((s, x) => s + x.totalValuePaisa, 0),
    };
  }

  async valuationReport() {
    const board = await this.stockBoard({});
    const rows = board
      .filter((r) => r.totalQtyMilli !== 0)
      .sort((a, b) => b.valuePaisa - a.valuePaisa);
    return {
      totalPaisa: rows.reduce((s, r) => s + r.valuePaisa, 0),
      rows,
    };
  }
}
