import { ensureSingleton } from '../common/singleton';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PayMethod, NotifyChannel, NotifyMode, SupplierStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceEventsService } from '../finance/finance-events.service';
import { AuditService } from '../common/audit.service';
import type {
  SupplierListQuery,
  SupplierCreateDto,
  SupplierPatch,
  SupplierPayDto,
  SupplierAdjustDto,
  SupplierTypeDto,
  LinkNamesDto,
} from './supplier.dto';

/*
  SUPPLIER — service layer.
  Full architecture + reasoning: RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md (23 Jul 2026).

  Rules enforced here:
    SUP-R01  only name+type required; phone duplicate warns, never blocks   DEC-SUP-002
    SUP-R02  soft-delete only; INACTIVE hides from pickers                  core
    SUP-R03  audit + timeline on every write                                core
    SUP-R04  opening due immutable once set — corrections = adjustment rows DEC-SUP-005
    SUP-R05  payment allocation: opening first, then oldest purchase;
             manual override allowed; excess → SupplierCredit               DEC-SUP-006
    SUP-R06  each purchase allocation writes a real PurchasePayment         DEC-PUR-004
    SUP-R08  sequential SUP- / SPY- numbers                                 DEC-PUR-008
    SUP-R09  this module never writes stock                                 DEC-PUR-002
*/

const ENTITY = 'Supplier';

/** DEC-SUP-001/009 — lazy-seeded system rows (Assembly floor-warehouse pattern).
 *  name = label, isFulfillment = the behaviour the UI branches on. */
const SYSTEM_TYPES: { name: string; isFulfillment: boolean }[] = [
  { name: 'Product Supplier', isFulfillment: false },
  { name: 'Fulfillment Vendor', isFulfillment: true },
];

type PurchaseDueRow = {
  id: string;
  purchaseNo: string;
  purchaseDate: Date;
  grandTotalPaisa: number;
  paidPaisa: number;
  dueCutPaisa: number;
  duePaisa: number;
};

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    // DEC-FIN-022 — the supplier payment is the ONLY thing Finance posts; the
    // PurchasePayment rows it creates above are skipped there on purpose.
    private readonly finance: FinanceEventsService,
  ) {}

  /* ---------------------------------------------------------------- numbers */

  private async nextNo(prefix: 'SUP' | 'SPY'): Promise<string> {
    const field = prefix === 'SUP' ? 'supplierNo' : 'paymentNo';
    const model = prefix === 'SUP' ? this.prisma.supplier : this.prisma.supplierPayment;
    const last = await (model as any).findFirst({
      where: { [field]: { startsWith: `${prefix}-` } },
      orderBy: { [field]: 'desc' },
      select: { [field]: true },
    });
    const lastNo: string | undefined = last?.[field];
    const n = lastNo ? parseInt(lastNo.slice(4), 10) + 1 : 1;
    return `${prefix}-${String(n).padStart(6, '0')}`;
  }

  /* ---------------------------------------------------------------- types */

  async listTypes() {
    await this.ensureSystemTypes();
    return this.prisma.db.supplierType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { suppliers: { where: { deletedAt: null } } } } },
    });
  }

  private async ensureSystemTypes() {
    for (let i = 0; i < SYSTEM_TYPES.length; i++) {
      const t = SYSTEM_TYPES[i];
      /* SUP-REV-8 (30 Jul) — `SupplierType.name` is @unique and this was `findFirst →
         create`. Seventh of the seven lazily-created unique rows the 30 Jul sweep found
         (the 29 Jul pass grepped for `*Setting` accessors, so the lesson reached the
         shape and not the hazard). `ensureSystemTypes()` runs on the supplier screen
         load, which is the classic double-fire in dev. */
      const existing = await ensureSingleton(
        () => this.prisma.supplierType.findFirst({ where: { name: t.name } }),
        () => this.prisma.supplierType.create({
          data: { name: t.name, sortOrder: i, isSystem: true, isFulfillment: t.isFulfillment },
        }),
      );
      if (existing.isFulfillment !== t.isFulfillment) {
        // backfill — rows created before DEC-SUP-009 carry default(false)
        await this.prisma.supplierType.update({
          where: { id: existing.id },
          data: { isFulfillment: t.isFulfillment },
        });
      }
    }
  }

  async createType(dto: SupplierTypeDto) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Type name is required');
    const dup = await this.prisma.db.supplierType.findFirst({ where: { name } });
    if (dup) throw new BadRequestException('A type with this name already exists');
    const created = await this.prisma.db.supplierType.create({
      data: { name, sortOrder: dto.sortOrder ?? 99, isFulfillment: dto.isFulfillment ?? false },
    });
    await this.audit.record({
      entityType: 'SupplierType',
      entityId: created.id,
      action: 'CREATE',
      actorName: dto.actorName ?? 'Admin',
      changes: { name },
    });
    return created;
  }

  async updateType(id: string, dto: SupplierTypeDto) {
    const row = await this.prisma.db.supplierType.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Type not found');
    const updated = await this.prisma.db.supplierType.update({
      where: { id },
      data: {
        name: dto.name?.trim() || row.name,
        sortOrder: dto.sortOrder ?? row.sortOrder,
        // DEC-SUP-009 — system rows' behaviour is the backbone, never editable
        ...(row.isSystem || dto.isFulfillment === undefined ? {} : { isFulfillment: dto.isFulfillment }),
      },
    });
    await this.audit.record({
      entityType: 'SupplierType',
      entityId: id,
      action: 'UPDATE',
      actorName: dto.actorName ?? 'Admin',
      changes: { name: updated.name },
    });
    return updated;
  }

  async removeType(id: string, actor: string) {
    const row = await this.prisma.db.supplierType.findFirst({
      where: { id },
      include: { _count: { select: { suppliers: { where: { deletedAt: null } } } } },
    });
    if (!row) throw new NotFoundException('Type not found');
    if (row.isSystem) throw new BadRequestException('System types cannot be deleted');
    if (row._count.suppliers > 0)
      throw new BadRequestException('Type is in use — move its suppliers first');
    await this.prisma.db.supplierType.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      entityType: 'SupplierType',
      entityId: id,
      action: 'DELETE',
      actorName: actor,
    });
    return { ok: true };
  }

  /* ---------------------------------------------------------------- balances */

  /** DEC-SUP-008 — due = openingRemaining + Σ linked purchase dues + Σ adjustments */
  private async balances(supplierId: string) {
    const [supplier, purchases, payments, adjustments, credits] = await Promise.all([
      this.prisma.db.supplier.findFirst({ where: { id: supplierId } }),
      this.prisma.db.purchase.findMany({
        where: { supplierId, status: { not: 'CANCELLED' } },
        include: {
          payments: { where: { deletedAt: null } },
          returns: { where: { deletedAt: null } },
        },
        orderBy: { purchaseDate: 'asc' },
      }),
      this.prisma.db.supplierPayment.findMany({
        where: { supplierId },
        include: { allocations: true },
      }),
      this.prisma.db.supplierAdjustment.findMany({ where: { supplierId } }),
      this.prisma.db.supplierCredit.findMany({
        where: { supplierId, appliedPurchaseId: null, appliedAt: null }, // SUP-R11
      }),
    ]);
    if (!supplier) throw new NotFoundException('Supplier not found');

    const openingPaid = payments
      .flatMap((p) => p.allocations)
      .filter((a) => a.purchaseId === null)
      .reduce((s, a) => s + a.amountPaisa, 0);
    const openingRemaining = Math.max(supplier.openingDuePaisa - openingPaid, 0);

    const purchaseDues: PurchaseDueRow[] = purchases.map((p) => {
      const paid = p.payments.reduce((s, x) => s + x.amountPaisa, 0);
      const dueCut = p.returns.reduce((s, r) => s + r.dueCutPaisa, 0);
      const due = Math.max(p.grandTotalPaisa - dueCut - paid, 0);
      return {
        id: p.id,
        purchaseNo: p.purchaseNo,
        purchaseDate: p.purchaseDate,
        grandTotalPaisa: p.grandTotalPaisa,
        paidPaisa: paid,
        dueCutPaisa: dueCut,
        duePaisa: due,
      };
    });

    const adjustmentPaisa = adjustments.reduce((s, a) => s + a.amountPaisa, 0);
    const purchaseDuePaisa = purchaseDues.reduce((s, p) => s + p.duePaisa, 0);
    const duePaisa = Math.max(openingRemaining + purchaseDuePaisa + adjustmentPaisa, 0);
    const creditPaisa = credits.reduce((s, c) => s + c.amountPaisa, 0);

    return {
      supplier,
      purchaseDues,
      openingRemaining,
      openingPaid,
      adjustmentPaisa,
      duePaisa,
      creditPaisa,
      netDuePaisa: duePaisa - creditPaisa,
      totalBoughtPaisa: purchases.reduce((s, p) => s + p.grandTotalPaisa, 0),
      purchaseCount: purchases.length,
      lastPurchaseAt: purchases.length ? purchases[purchases.length - 1].purchaseDate : null,
    };
  }

  /* ---------------------------------------------------------------- read */

  async list(q: SupplierListQuery) {
    const where: Prisma.SupplierWhereInput = {};
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { nickname: { contains: q.search, mode: 'insensitive' } },
        { phone: { contains: q.search } },
        { supplierNo: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (q.typeId) where.typeId = q.typeId;
    if (q.status && q.status !== 'ALL') where.status = q.status as SupplierStatus;
    else if (!q.status) where.status = 'ACTIVE'; // default: hide INACTIVE (SUP-R02)

    const rows = await this.prisma.db.supplier.findMany({
      where,
      include: {
        type: true,
        _count: { select: { items: { where: { deletedAt: null } } } }, // vendor board shows it
      },
      orderBy: { name: 'asc' },
      take: 500,
    });

    const shaped: Array<Record<string, unknown> & { duePaisa: number; name: string }> = [];
    for (const s of rows) {
      const b = await this.balances(s.id);
      shaped.push({
        ...s,
        duePaisa: b.duePaisa,
        creditPaisa: b.creditPaisa,
        netDuePaisa: b.netDuePaisa,
        totalBoughtPaisa: b.totalBoughtPaisa,
        purchaseCount: b.purchaseCount,
        lastPurchaseAt: b.lastPurchaseAt,
      });
    }

    let out = shaped;
    if (q.due === '1') out = out.filter((s) => s.duePaisa > 0);
    const dir = q.dir === 'asc' ? 1 : -1;
    if (q.sort === 'due') out = [...out].sort((a, b) => dir * (a.duePaisa - b.duePaisa));
    else if (q.sort === 'recent')
      out = [...out].sort(
        (a, b) =>
          dir *
          ((new Date((a as any).lastPurchaseAt ?? 0).getTime() || 0) -
            (new Date((b as any).lastPurchaseAt ?? 0).getTime() || 0)),
      );
    return out;
  }

  /** Overview cards + due board — server-side, never "first N rows" (D1 lesson).
   *  Review fix (23 Jul): INACTIVE suppliers must NOT hide their money — an
   *  inactive supplier with due or credit stays on the board, flagged. Setting
   *  someone inactive is a picker choice, never an accounting eraser. */
  async stats() {
    const suppliers = await this.prisma.db.supplier.findMany({
      include: { type: true },
    });
    const board: {
      id: string;
      name: string;
      nickname: string | null;
      typeName: string;
      isFulfillment: boolean; // DEC-SUP-009 — the UI splits the workspaces on this
      status: string;
      duePaisa: number;
      creditPaisa: number;
    }[] = [];
    for (const s of suppliers) {
      const b = await this.balances(s.id);
      // active → always on the board; inactive → only while money is unfinished
      if (s.status !== 'ACTIVE' && b.duePaisa === 0 && b.creditPaisa === 0) continue;
      board.push({
        id: s.id,
        name: s.name,
        nickname: s.nickname,
        typeName: s.type.name,
        isFulfillment: s.type.isFulfillment,
        status: s.status,
        duePaisa: b.duePaisa,
        creditPaisa: b.creditPaisa,
      });
    }
    board.sort((a, b) => b.duePaisa - a.duePaisa);
    const unlinked = await this.unlinkedNames();
    return {
      supplierCount: suppliers.filter((s) => s.status === 'ACTIVE').length,
      totalDuePaisa: board.reduce((s, r) => s + r.duePaisa, 0),
      totalCreditPaisa: board.reduce((s, r) => s + r.creditPaisa, 0),
      dueCount: board.filter((r) => r.duePaisa > 0).length,
      board,
      unlinkedNameCount: unlinked.length,
    };
  }

  async findOne(id: string) {
    const b = await this.balances(id);
    const [type, items, credits, adjustments] = await Promise.all([
      this.prisma.db.supplierType.findFirst({ where: { id: b.supplier.typeId } }),
      this.prisma.db.item.findMany({
        where: { supplierId: id },
        // DEC-SUP-009 (A) — the vendor price IS Item.standardCostPaisa (one cost,
        // one owner; a second "vendorPrice" column would drift). Linked products
        // bring the selling side so the panel can show the margin.
        select: {
          id: true,
          sku: true,
          name: true,
          imageUrl: true,
          isStockTracked: true,
          isActive: true,
          standardCostPaisa: true,
          products: {
            where: { deletedAt: null },
            select: { id: true, name: true, sellingPricePaisa: true, isPublished: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.db.supplierCredit.findMany({
        where: { supplierId: id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.supplierAdjustment.findMany({
        where: { supplierId: id },
        orderBy: { adjustedAt: 'desc' },
      }),
    ]);
    return {
      ...b.supplier,
      type,
      items,
      credits,
      adjustments,
      duePaisa: b.duePaisa,
      creditPaisa: b.creditPaisa,
      netDuePaisa: b.netDuePaisa,
      openingRemaining: b.openingRemaining,
      openingPaid: b.openingPaid,
      adjustmentPaisa: b.adjustmentPaisa,
      totalBoughtPaisa: b.totalBoughtPaisa,
      purchaseCount: b.purchaseCount,
      lastPurchaseAt: b.lastPurchaseAt,
      purchaseDues: b.purchaseDues,
    };
  }

  /**
   * DEC-SUP-008 — the ledger: opening · purchases · payments · returns ·
   * adjustments, one merged stream, newest first. Direct per-bill payments
   * (made on Purchase detail) are the PurchasePayment rows NOT referenced by
   * any SupplierPaymentAllocation — supplier-level payments show once, as
   * themselves, with their split.
   */
  async ledger(id: string) {
    const b = await this.balances(id);
    const [supPayments, purchases, adjustments, returns] = await Promise.all([
      this.prisma.db.supplierPayment.findMany({
        where: { supplierId: id },
        include: { allocations: true },
      }),
      this.prisma.db.purchase.findMany({
        where: { supplierId: id, status: { not: 'CANCELLED' } },
        include: {
          payments: { where: { deletedAt: null } },
          returns: { where: { deletedAt: null } },
        },
      }),
      this.prisma.db.supplierAdjustment.findMany({ where: { supplierId: id } }),
      this.prisma.db.purchaseReturn.findMany({
        where: { purchase: { supplierId: id }, deletedAt: null },
        include: { purchase: { select: { purchaseNo: true } } },
      }),
    ]);

    const allocatedPaymentIds = new Set(
      supPayments.flatMap((p) => p.allocations).map((a) => a.purchasePaymentId).filter(Boolean),
    );

    type LedgerEvent = {
      at: Date;
      kind: 'OPENING' | 'PURCHASE' | 'PAYMENT' | 'BILL_PAYMENT' | 'RETURN' | 'ADJUSTMENT';
      label: string;
      ref?: string;
      refId?: string;
      /** signed effect on due: + increases what we owe, − decreases */
      amountPaisa: number;
      detail?: unknown;
    };
    const events: LedgerEvent[] = [];

    if (b.supplier.openingDuePaisa > 0) {
      events.push({
        at: b.supplier.openingAsOf ?? b.supplier.createdAt,
        kind: 'OPENING',
        label: 'Opening due (old ledger)',
        amountPaisa: b.supplier.openingDuePaisa,
        detail: { note: b.supplier.openingNote },
      });
    }
    for (const p of purchases) {
      events.push({
        at: p.purchaseDate,
        kind: 'PURCHASE',
        label: `Purchase ${p.purchaseNo}`,
        ref: p.purchaseNo,
        refId: p.id,
        amountPaisa: p.grandTotalPaisa,
      });
      for (const pay of p.payments) {
        if (allocatedPaymentIds.has(pay.id)) continue; // shown via the supplier payment
        events.push({
          at: pay.paidAt,
          kind: 'BILL_PAYMENT',
          label: `Payment on ${p.purchaseNo} (${pay.method})`,
          ref: p.purchaseNo,
          refId: p.id,
          amountPaisa: -pay.amountPaisa,
        });
      }
    }
    for (const sp of supPayments) {
      events.push({
        at: sp.paidAt,
        kind: 'PAYMENT',
        label: `Payment ${sp.paymentNo} (${sp.method})`,
        ref: sp.paymentNo,
        amountPaisa: -sp.amountPaisa,
        detail: {
          note: sp.note,
          allocations: sp.allocations.map((a) => ({
            purchaseId: a.purchaseId,
            amountPaisa: a.amountPaisa,
          })),
        },
      });
    }
    for (const r of returns) {
      events.push({
        at: r.returnDate,
        kind: 'RETURN',
        label: `Return ${r.returnNo} on ${r.purchase.purchaseNo}`,
        ref: r.returnNo,
        amountPaisa: -(r.dueCutPaisa + r.creditPaisa),
        detail: { dueCutPaisa: r.dueCutPaisa, creditPaisa: r.creditPaisa },
      });
    }
    for (const a of adjustments) {
      events.push({
        at: a.adjustedAt,
        kind: 'ADJUSTMENT',
        label: 'Adjustment',
        amountPaisa: a.amountPaisa,
        detail: { note: a.note },
      });
    }

    events.sort((x, y) => y.at.getTime() - x.at.getTime());

    // month summary blocks (bought / paid per month)
    const months = new Map<string, { bought: number; paid: number; returned: number }>();
    for (const e of events) {
      const key = `${e.at.getFullYear()}-${String(e.at.getMonth() + 1).padStart(2, '0')}`;
      const m = months.get(key) ?? { bought: 0, paid: 0, returned: 0 };
      if (e.kind === 'PURCHASE' || e.kind === 'OPENING') m.bought += e.amountPaisa;
      else if (e.kind === 'PAYMENT' || e.kind === 'BILL_PAYMENT') m.paid += -e.amountPaisa;
      else if (e.kind === 'RETURN') m.returned += -e.amountPaisa;
      months.set(key, m);
    }

    return {
      events,
      months: [...months.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([month, v]) => ({ month, ...v })),
      duePaisa: b.duePaisa,
      creditPaisa: b.creditPaisa,
      netDuePaisa: b.netDuePaisa,
    };
  }

  timeline(id: string) {
    return this.audit.timeline(ENTITY, id);
  }

  /* ---------------------------------------------------------------- create / update */

  async create(dto: SupplierCreateDto) {
    const actor = dto.actorName ?? 'Admin';
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Name is required');
    if (!dto.typeId) throw new BadRequestException('Type is required');
    const type = await this.prisma.db.supplierType.findFirst({ where: { id: dto.typeId } });
    if (!type) throw new BadRequestException('Type not found');

    // SUP-R01 — duplicate phone warns, never blocks
    const phone = dto.phone?.trim() || null;
    if (phone && !dto.confirmDuplicatePhone) {
      const dup = await this.prisma.db.supplier.findFirst({
        where: { phone },
        select: { name: true },
      });
      if (dup)
        throw new BadRequestException(
          `DUPLICATE_PHONE:"${dup.name}" already uses this phone — confirm to save anyway`,
        );
    }

    const opening = dto.openingDuePaisa ?? 0;
    if (!Number.isInteger(opening) || opening < 0)
      throw new BadRequestException('Opening due must be a non-negative integer (paisa)');

    const supplierNo = await this.nextNo('SUP');
    const created = await this.prisma.db.supplier.create({
      data: {
        supplierNo,
        name,
        nickname: dto.nickname?.trim() || null,
        typeId: dto.typeId,
        phone,
        contactPerson: dto.contactPerson?.trim() || null,
        market: dto.market?.trim() || null,
        address: dto.address?.trim() || null,
        photoUrl: dto.photoUrl || null,
        paymentTerms: dto.paymentTerms?.trim() || null,
        payoutInfo: dto.payoutInfo?.trim() || null,
        notifyPhone: dto.notifyPhone?.trim() || null,
        notifyChannel: (dto.notifyChannel as NotifyChannel) ?? 'OFF',
        notifyMode: (dto.notifyMode as NotifyMode) ?? 'MANUAL',
        leadTimeHours: dto.leadTimeHours ?? null,
        notes: dto.notes?.trim() || null,
        openingDuePaisa: opening,
        openingAsOf: dto.openingAsOf ? new Date(dto.openingAsOf) : opening > 0 ? new Date() : null,
        openingNote: dto.openingNote?.trim() || null,
      },
    });

    await this.audit.record({
      entityType: ENTITY,
      entityId: created.id,
      action: 'CREATE',
      actorName: actor,
      changes: { supplierNo, name, typeId: dto.typeId, openingDuePaisa: opening },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: created.id,
      kind: 'general',
      label: `Supplier ${supplierNo} created — ${name}`,
      actorName: actor,
    });
    return this.findOne(created.id);
  }

  async update(id: string, dto: SupplierPatch) {
    const actor = dto.actorName ?? 'Admin';
    const row = await this.prisma.db.supplier.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Supplier not found');

    // SUP-R04 — opening due may be SET once (if it was never set), then frozen
    let openingData: Prisma.SupplierUpdateInput = {};
    if (dto.openingDuePaisa !== undefined) {
      if (row.openingDuePaisa > 0)
        throw new BadRequestException(
          'Opening due is already set — corrections go through an Adjustment entry (SUP-R04)',
        );
      if (!Number.isInteger(dto.openingDuePaisa) || dto.openingDuePaisa < 0)
        throw new BadRequestException('Opening due must be a non-negative integer (paisa)');
      openingData = {
        openingDuePaisa: dto.openingDuePaisa,
        openingAsOf: dto.openingAsOf ? new Date(dto.openingAsOf) : new Date(),
        openingNote: dto.openingNote?.trim() || null,
      };
    }

    const phone = dto.phone !== undefined ? dto.phone?.trim() || null : undefined;
    if (phone && phone !== row.phone && !dto.confirmDuplicatePhone) {
      const dup = await this.prisma.db.supplier.findFirst({
        where: { phone, id: { not: id } },
        select: { name: true },
      });
      if (dup)
        throw new BadRequestException(
          `DUPLICATE_PHONE:"${dup.name}" already uses this phone — confirm to save anyway`,
        );
    }

    if (dto.typeId) {
      const type = await this.prisma.db.supplierType.findFirst({ where: { id: dto.typeId } });
      if (!type) throw new BadRequestException('Type not found');
    }

    const updated = await this.prisma.db.supplier.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() || row.name } : {}),
        ...(dto.nickname !== undefined ? { nickname: dto.nickname?.trim() || null } : {}),
        // checked update input — the FK moves via the relation, not the scalar
        ...(dto.typeId ? { type: { connect: { id: dto.typeId } } } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(dto.contactPerson !== undefined ? { contactPerson: dto.contactPerson?.trim() || null } : {}),
        ...(dto.market !== undefined ? { market: dto.market?.trim() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl || null } : {}),
        ...(dto.paymentTerms !== undefined ? { paymentTerms: dto.paymentTerms?.trim() || null } : {}),
        ...(dto.payoutInfo !== undefined ? { payoutInfo: dto.payoutInfo?.trim() || null } : {}),
        ...(dto.notifyPhone !== undefined ? { notifyPhone: dto.notifyPhone?.trim() || null } : {}),
        ...(dto.notifyChannel ? { notifyChannel: dto.notifyChannel as NotifyChannel } : {}),
        ...(dto.notifyMode ? { notifyMode: dto.notifyMode as NotifyMode } : {}),
        ...(dto.leadTimeHours !== undefined ? { leadTimeHours: dto.leadTimeHours ?? null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.status ? { status: dto.status as SupplierStatus } : {}),
        ...openingData,
      },
    });

    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName: actor,
      changes: { ...dto, actorName: undefined },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'general',
      label: `Supplier updated — ${updated.name}`,
      actorName: actor,
    });
    return this.findOne(id);
  }

  async remove(id: string, actor: string) {
    const b = await this.balances(id);
    if (b.duePaisa > 0)
      throw new BadRequestException(
        'This supplier still has due — settle or adjust it first, or set status INACTIVE instead',
      );
    if (b.creditPaisa > 0)
      throw new BadRequestException(
        'We still hold credit with this supplier — apply it to a due or write it off with an adjustment first (review fix: deleting would orphan the money)',
      );
    await this.prisma.db.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'DELETE', actorName: actor });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'general',
      label: `Supplier deleted — ${b.supplier.name}`,
      actorName: actor,
    });
    return { ok: true };
  }

  /* ---------------------------------------------------------------- payment */

  /**
   * SUP-R05/R06 — supplier-level payment.
   * Auto split: opening due first, then purchases oldest-first. A hand-adjusted
   * split from the confirm screen is validated against the same ceilings.
   * Excess beyond total due → SupplierCredit (DEC-PUR-006: no cash-back path).
   */
  async pay(id: string, dto: SupplierPayDto) {
    const actor = dto.actorName ?? 'Admin';
    const amount = dto.amountPaisa;
    if (!Number.isInteger(amount) || amount <= 0)
      throw new BadRequestException('Amount must be a positive integer (paisa)');
    if (!dto.method) throw new BadRequestException('Method is required');

    const b = await this.balances(id);
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    // build the split
    let split: { purchaseId: string | null; amountPaisa: number }[];
    if (dto.allocations?.length) {
      // manual override — validate ceilings AGGREGATED per target (review fix:
      // two rows against the same bill must not each pass the ceiling alone)
      const perTarget = new Map<string | null, number>();
      let sum = 0;
      for (const a of dto.allocations) {
        if (!Number.isInteger(a.amountPaisa) || a.amountPaisa <= 0)
          throw new BadRequestException('Each allocation must be a positive integer');
        perTarget.set(a.purchaseId, (perTarget.get(a.purchaseId) ?? 0) + a.amountPaisa);
        sum += a.amountPaisa;
      }
      for (const [target, total] of perTarget) {
        if (target === null) {
          if (total > b.openingRemaining)
            throw new BadRequestException('Allocation exceeds the remaining opening due');
        } else {
          const p = b.purchaseDues.find((x) => x.id === target);
          if (!p) throw new BadRequestException('Allocation targets a purchase not belonging to this supplier');
          if (total > p.duePaisa)
            throw new BadRequestException(`Allocation exceeds the due of ${p.purchaseNo}`);
        }
      }
      if (sum > amount) throw new BadRequestException('Allocations exceed the payment amount');
      split = dto.allocations;
    } else {
      // auto: opening first, then oldest purchase
      split = [];
      let left = amount;
      if (b.openingRemaining > 0 && left > 0) {
        const take = Math.min(b.openingRemaining, left);
        split.push({ purchaseId: null, amountPaisa: take });
        left -= take;
      }
      for (const p of b.purchaseDues) {
        if (left <= 0) break;
        if (p.duePaisa <= 0) continue;
        const take = Math.min(p.duePaisa, left);
        split.push({ purchaseId: p.id, amountPaisa: take });
        left -= take;
      }
    }
    const allocated = split.reduce((s, a) => s + a.amountPaisa, 0);
    const excess = amount - allocated;

    const paymentNo = await this.nextNo('SPY');
    const payment = await this.prisma.db.supplierPayment.create({
      data: {
        paymentNo,
        supplierId: id,
        amountPaisa: amount,
        method: dto.method as PayMethod,
        paidAt,
        note: dto.note?.trim() || null,
      },
    });

    // materialise per-bill rows (SUP-R06) + allocation links
    for (const a of split) {
      let purchasePaymentId: string | null = null;
      if (a.purchaseId) {
        const pp = await this.prisma.db.purchasePayment.create({
          data: {
            purchaseId: a.purchaseId,
            amountPaisa: a.amountPaisa,
            method: dto.method as PayMethod,
            paidAt,
            note: `via ${paymentNo}`,
          },
        });
        purchasePaymentId = pp.id;
      }
      await this.prisma.db.supplierPaymentAllocation.create({
        data: {
          paymentId: payment.id,
          purchaseId: a.purchaseId,
          purchasePaymentId,
          amountPaisa: a.amountPaisa,
        },
      });
    }

    if (excess > 0) {
      // DEC-PUR-006 — money never comes back; over-payment parks as credit
      await this.prisma.db.supplierCredit.create({
        data: {
          supplierName: b.supplier.name,
          supplierId: id,
          amountPaisa: excess,
          note: `Over-payment on ${paymentNo}`,
        },
      });
    }

    /* SUP-REV-9 (30 Jul) — awaited and flagged, not fire-and-forget.
       DEC-FIN-022 makes the SupplierPayment the ONE source Finance posts from: the
       PurchasePayment rows it created above are deliberately skipped there. So if THIS
       call fails silently, the money left the shop and nothing anywhere records it —
       there is no second door for it to come through. Of the nine floating calls the
       30 July sweep found, this is the only one with no fallback at all. */
    try {
      await this.finance.onSupplierPayment(payment.id);
    } catch (e) {
      await this.audit.event({
        entityType: ENTITY,
        entityId: id,
        kind: 'system',
        label: `⚠ Finance posting failed for ${paymentNo} — the payment is NOT in the books, and DEC-FIN-022 means nothing else will post it. Replay it from Finance.`,
        actorName: actor,
        note: e instanceof Error ? e.message : String(e),
      });
    }

    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName: actor,
      changes: { paymentNo, amountPaisa: amount, method: dto.method, allocations: split, excess },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'general',
      label: `Payment ${paymentNo} — ${(amount / 100).toLocaleString()} tk (${dto.method})${excess > 0 ? ` · ${(excess / 100).toLocaleString()} tk parked as credit` : ''}`,
      actorName: actor,
      note: dto.note,
    });

    return { paymentNo, allocations: split, excessToCreditPaisa: excess };
  }

  /** preview the auto split for the confirm screen — no writes */
  async payPreview(id: string, amountPaisa: number) {
    const b = await this.balances(id);
    const split: { purchaseId: string | null; purchaseNo: string | null; duePaisa: number; amountPaisa: number }[] = [];
    let left = amountPaisa;
    if (b.openingRemaining > 0 && left > 0) {
      const take = Math.min(b.openingRemaining, left);
      split.push({ purchaseId: null, purchaseNo: null, duePaisa: b.openingRemaining, amountPaisa: take });
      left -= take;
    }
    for (const p of b.purchaseDues) {
      if (p.duePaisa <= 0) continue;
      const take = left > 0 ? Math.min(p.duePaisa, left) : 0;
      split.push({ purchaseId: p.id, purchaseNo: p.purchaseNo, duePaisa: p.duePaisa, amountPaisa: take });
      left -= take;
    }
    return { split, excessToCreditPaisa: Math.max(left, 0), duePaisa: b.duePaisa };
  }

  /* ---------------------------------------------------------------- adjustment */

  async adjust(id: string, dto: SupplierAdjustDto) {
    const actor = dto.actorName ?? 'Admin';
    if (!Number.isInteger(dto.amountPaisa) || dto.amountPaisa === 0)
      throw new BadRequestException('Adjustment must be a non-zero integer (paisa)');
    if (!dto.note?.trim())
      throw new BadRequestException('A note is required — an unexplained correction is not a correction');
    const row = await this.prisma.db.supplier.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Supplier not found');

    await this.prisma.db.supplierAdjustment.create({
      data: { supplierId: id, amountPaisa: dto.amountPaisa, note: dto.note.trim() },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName: actor,
      changes: { adjustmentPaisa: dto.amountPaisa, note: dto.note },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'general',
      label: `Adjustment ${dto.amountPaisa > 0 ? '+' : ''}${(dto.amountPaisa / 100).toLocaleString()} tk`,
      actorName: actor,
      note: dto.note,
    });
    return this.findOne(id);
  }

  /* ---------------------------------------------------------------- credit apply */

  /**
   * SUP-R11 (review fix, 23 Jul) — DEC-PUR-006 promised "credit adjusts against
   * a future purchase" but no code path ever consumed a credit. This is it:
   * applying a credit writes a NEGATIVE SupplierAdjustment (settles due, audit
   * stays honest, no fake cash payment row) and stamps the credit `appliedAt`.
   * Partial fit: min(credit, due) applies; any remainder becomes a fresh credit
   * row so nothing silently vanishes. Blocked while due is zero.
   */
  async applyCredit(id: string, creditId: string, actor: string) {
    const b = await this.balances(id);
    const credit = await this.prisma.db.supplierCredit.findFirst({
      where: { id: creditId, supplierId: id },
    });
    if (!credit) throw new NotFoundException('Credit not found on this supplier');
    if (credit.appliedPurchaseId || credit.appliedAt)
      throw new BadRequestException('This credit is already consumed');
    if (b.duePaisa <= 0)
      throw new BadRequestException('No due to apply this credit against — it waits for the next purchase');

    const apply = Math.min(credit.amountPaisa, b.duePaisa);
    const leftover = credit.amountPaisa - apply;

    await this.prisma.db.supplierAdjustment.create({
      data: {
        supplierId: id,
        amountPaisa: -apply,
        note: `Credit applied${credit.note ? ` — ${credit.note}` : ''}`,
      },
    });
    await this.prisma.db.supplierCredit.update({
      where: { id: creditId },
      data: { appliedAt: new Date() },
    });
    if (leftover > 0) {
      await this.prisma.db.supplierCredit.create({
        data: {
          supplierName: b.supplier.name,
          supplierId: id,
          amountPaisa: leftover,
          note: `Remainder after applying ${(apply / 100).toLocaleString()} tk`,
        },
      });
    }

    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName: actor,
      changes: { creditApplied: creditId, appliedPaisa: apply, leftoverPaisa: leftover },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'general',
      label: `Credit ${(apply / 100).toLocaleString()} tk applied to due${leftover > 0 ? ` · ${(leftover / 100).toLocaleString()} tk still in credit` : ''}`,
      actorName: actor,
    });
    return this.findOne(id);
  }

  /* ---------------------------------------------------------------- link tool */

  /** DEC-SUP-007 — free-text purchase names not yet attached to a supplier */
  async unlinkedNames() {
    const rows = await this.prisma.db.purchase.groupBy({
      by: ['supplierName'],
      where: { supplierId: null, deletedAt: null },
      _count: { supplierName: true },
      _sum: { grandTotalPaisa: true },
      orderBy: { _count: { supplierName: 'desc' } },
    });
    return rows.map((r) => ({
      name: r.supplierName,
      purchaseCount: r._count.supplierName,
      totalPaisa: r._sum.grandTotalPaisa ?? 0,
    }));
  }

  async linkNames(id: string, dto: LinkNamesDto) {
    const actor = dto.actorName ?? 'Admin';
    const row = await this.prisma.db.supplier.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Supplier not found');
    const names = (dto.names ?? []).map((n) => n.trim()).filter(Boolean);
    if (!names.length) throw new BadRequestException('No names given');

    const purchases = await this.prisma.db.purchase.updateMany({
      where: { supplierName: { in: names }, supplierId: null },
      data: { supplierId: id },
    });
    const credits = await this.prisma.db.supplierCredit.updateMany({
      where: { supplierName: { in: names }, supplierId: null },
      data: { supplierId: id },
    });

    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName: actor,
      changes: { linkedNames: names, purchases: purchases.count, credits: credits.count },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: id,
      kind: 'general',
      label: `Linked ${purchases.count} purchase(s) under name(s): ${names.join(', ')}`,
      actorName: actor,
    });
    return { purchasesLinked: purchases.count, creditsLinked: credits.count };
  }
}
