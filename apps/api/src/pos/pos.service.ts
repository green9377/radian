import { ensureSingleton } from '../common/singleton';
import { createHash, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  DiscountType,
  ProductType,
  SalesStatus,
  DeliveryStatus,
  DeliveryZone,
  PaymentMethod,
  PaymentStatus,
  PaymentTxnKind,
  FulfillmentType,
  PosShiftStatus,
  PosCashKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethodsService } from '../common/payment-methods.service';
import { paidPaisa } from '../common/discount-window';
import { startOfBdDay, DAY_MS, BD_OFFSET_MS } from '../common/bd-day';
import { AuditService } from '../common/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { FinanceEventsService } from '../finance/finance-events.service';
import { FinanceService, ACC } from '../finance/finance.service';
import { ReturnsService } from '../returns/returns.service';
import {
  OpenShiftDto,
  CloseShiftDto,
  CashMovementDto,
  PosCashOutDto,
  CreatePosSaleDto,
  CollectDueDto,
  DiscountRuleInput,
  UpdatePosSettingsDto,
  CreateRegisterDto,
  PosPaymentDto,
  PosTender,
  PosDiscountApproveDto,
  VoidPosSaleDto,
} from './pos.dto';

const ENTITY = 'PosSale';
const TENDER_METHOD: Record<PosTender, PaymentMethod> = {
  cash: PaymentMethod.cash,
  bkash: PaymentMethod.bkash,
  nagad: PaymentMethod.nagad,
  card: PaymentMethod.card,
};

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    // Finance consumes the completed counter sale — fail-soft (DEC-FIN-010)
    private readonly financeEvents: FinanceEventsService,
    /*  P7-2 — Finance still WRITES the expense/transfer when cash leaves the
        till; POS only asks. One-way, the same direction as every other module.  */
    private readonly finance: FinanceService,
    /*  DEC-GBL-001 — one payment list for the whole shop  */
    private readonly payMethods: PaymentMethodsService,
    /*  DEC-RTN-015 — Returns owns the store-credit ledger; POS only asks it to
        spend some. One-way, like every other module edge here.  */
    private readonly returns: ReturnsService,
  ) {}

  /* ------------------------------------------------ helpers */

  /**
   * (POS audit 11 Sep 2026 §1 #10) — every money field checked at the door.
   *
   * Tenders were validated (POS-REV-6) and cash movements were validated, but
   * `discountPaisa`, `adjustmentPaisa`, `storeCreditPaisa`, `unitPaisa` and
   * `qty` were not — and all five land in `Int` columns. A fractional value was
   * a 500 at the till with the customer standing there, and a fractional
   * `storeCreditPaisa` wrote a non-integer straight into `paidPaisa`. The admin
   * rounds correctly, so this only ever bit some other caller — which is
   * exactly the caller nobody is watching.
   */
  private assertPaisa(label: string, value: number, opts: { signed?: boolean } = {}) {
    if (!Number.isInteger(value)) {
      throw new BadRequestException(`${label} must be a whole number of paisa`);
    }
    if (!opts.signed && value < 0) {
      throw new BadRequestException(`${label} cannot be negative`);
    }
    // a paisa figure past 2^31 does not fit the column it is going into
    if (!Number.isSafeInteger(value) || Math.abs(value) > 2_000_000_000) {
      throw new BadRequestException(`${label} is out of range`);
    }
  }

  /**
   * POS-REV-2 (30 Jul) — allocate a receipt number and RETRY if somebody took it.
   *
   * `Order.orderNo` and `PosShift.shiftNo` are @unique and both numbers were
   * read-the-highest-then-add-one. Two counters ringing up at the same second both
   * read POS-000412, both write it, and the loser came back as a raw P2002 — a 500
   * on the till with the customer standing there holding money.
   *
   * Of everywhere this pattern appears in the system, POS is the worst place for it:
   * it is the only screen where two people are meant to be working at once, at speed.
   */
  private async withNextNo<T>(
    next: (skip: number) => Promise<string>,
    write: (no: string) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        return await write(await next(attempt));
      } catch (e) {
        /*  (POS audit 11 Sep 2026 §1 #1) — only a RECEIPT-NUMBER clash is worth
            another go. `Order.posIdempotencyKey` is unique too, and a clash
            there means "this attempt already became a bill" — retrying it eight
            times with eight fresh numbers would be the very duplicate the key
            exists to prevent. So that one is handed straight back to the caller,
            which turns it into the original sale.  */
        const p2002 = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        const onKey = p2002 && JSON.stringify((e as Prisma.PrismaClientKnownRequestError).meta ?? {}).includes('osIdempotencyKey');
        const taken = p2002 && !onKey;
        if (!taken || attempt === 7) throw e;
      }
    }
    throw new BadRequestException('Could not allocate a receipt number — try again.');
  }

  /** DEC-POS-004 — sequential POS receipt number POS-NNNNNN (shared counter pattern). */
  private async nextPosNo(skip = 0): Promise<string> {
    // raw client: a deleted bill still holds its number in the unique index
    const last = await this.prisma.order.findFirst({
      where: { orderNo: { startsWith: 'POS-' } },
      orderBy: { orderNo: 'desc' },
      select: { orderNo: true },
    });
    const n = (last?.orderNo ? parseInt(last.orderNo.slice(4), 10) + 1 : 1) + skip;
    return `POS-${String(n).padStart(6, '0')}`;
  }

  private async nextShiftNo(skip = 0): Promise<string> {
    const last = await this.prisma.posShift.findFirst({
      where: { shiftNo: { startsWith: 'SHF-' } },
      orderBy: { shiftNo: 'desc' },
      select: { shiftNo: true },
    });
    const n = (last?.shiftNo ? parseInt(last.shiftNo.slice(4), 10) + 1 : 1) + skip;
    return `SHF-${String(n).padStart(6, '0')}`;
  }

  /* POS-REV-1 (30 Jul) — THREE MORE unprotected lazy singletons, all in this file.
     With Inventory's assembly floor that makes FOUR the 29 July sweep missed, and they
     were all missed the same way: that pass looked for `*Setting` accessors, so the
     lesson was applied to the SHAPE (a settings row) rather than to the HAZARD (any
     lazily-created row behind a @unique column).
     `Channel.slug`, `Customer.phone` and `PosRegister.code` are all @unique, so the
     first two counter sales of the morning raced each other and one died on P2002 —
     at the till, before a receipt existed. */

  /** POS channel (unified ledger — DEC-POS-001/002). */
  private async posChannelId(): Promise<string> {
    const c = await ensureSingleton(
      () => this.prisma.db.channel.findFirst({ where: { slug: 'pos' }, select: { id: true } }),
      () => this.prisma.db.channel.create({ data: { slug: 'pos', name: 'POS' }, select: { id: true } }),
    );
    return c.id;
  }

  /** Anonymous walk-in system customer (DEC-POS-007). */
  private async walkInCustomerId(): Promise<string> {
    const c = await ensureSingleton(
      () => this.prisma.db.customer.findFirst({ where: { phone: 'WALK-IN' }, select: { id: true } }),
      () => this.prisma.db.customer.create({ data: { name: 'Walk-in Customer', phone: 'WALK-IN' }, select: { id: true } }),
    );
    return c.id;
  }

  /**
   * POS-REV-5 (30 Jul) — the ONE place a finance event leaves this module.
   * Every call used to be `void this.finance…`. `safe()` swallows the error into a
   * FinancePostingFailure row, which is right, but nothing put it in front of anybody
   * — and this is the cash register. A POS sale that never posts takes its revenue,
   * its VAT and its cost of goods with it, and the day still looks like it balanced.
   */
  private async book(orderOrShiftId: string, what: string, run: () => Promise<void>, actorName: string) {
    try {
      await run();
    } catch (e) {
      await this.audit.event({
        entityType: 'Order',
        entityId: orderOrShiftId,
        kind: 'system',
        label: `⚠ Finance posting failed (${what}) — NOT in the books, replay it from Finance`,
        actorName,
        note: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /** Resolve the customer for a sale: explicit id → phone upsert → walk-in. */
  private async resolveCustomer(dto: { customerId?: string; customerName?: string; customerPhone?: string }) {
    if (dto.customerId) {
      const c = await this.prisma.db.customer.findFirst({ where: { id: dto.customerId } });
      if (!c) throw new BadRequestException('customer not found');
      return c;
    }
    const phone = dto.customerPhone?.trim();
    if (phone) {
      /* POS-REV-8 (30 Jul) — the FOURTH one in this file, and I missed it on the first
         pass; the system-wide sweep found it. `Customer.phone` is @unique, so two
         counter sales taking the same NEW phone number at the same moment both looked,
         both saw nothing, and the loser died on P2002 — at the till.
         This is not a hypothetical: it is what happens when a customer buys at one
         counter and their spouse pays at the other, which for a flower shop on
         Valentine's morning is a Tuesday. */
      return ensureSingleton(
        () => this.prisma.db.customer.findFirst({ where: { phone } }),
        () => this.prisma.db.customer.create({ data: { name: dto.customerName?.trim() || phone, phone } }),
      );
    }
    const id = await this.walkInCustomerId();
    const c = await this.prisma.db.customer.findFirst({ where: { id } });
    if (!c) throw new BadRequestException('walk-in customer unavailable');
    return c;
  }

  /* ------------------------------------------------ settings */

  async settings() {
    // ensureSingleton — survives two requests creating this row at once (P2002)
    const s = await ensureSingleton(
      () => this.prisma.db.posSetting.findFirst(),
      () => this.prisma.db.posSetting.create({ data: {} }),
    );
    /*  DEC-GBL-002 (owner, 21 Aug) — VAT is one rate for the shop, and Finance
        owns it (it is what the Mushak challan prints). The till used to keep a
        second rate of its own, so a bill could carry a percentage the books had
        never heard of. The column stays for now; nothing reads it.  */
    const fin = await this.prisma.db.financeSetting.findFirst({
      select: { vatEnabled: true, vatRateBps: true },
    });
    return { ...s, defaultTaxRateBps: fin?.vatEnabled ? fin.vatRateBps : 0 };
  }

  async updateSettings(patch: UpdatePosSettingsDto) {
    const s = await this.settings();
    /*  Take the fields by name, never the body as it stands. ActorInterceptor
        stamps `actorName` onto every write body so the ledger records the real
        person, and PosSetting has no such column — so passing the DTO straight
        through made Prisma refuse ("Unknown argument actorName") and POS
        settings could never be saved at all. Found 21 Aug while adding
        DEC-POS-021; the bug was older than the feature.  */
    const data: Prisma.PosSettingUpdateInput = {};
    if (patch.openingFloatDefaultPaisa !== undefined) data.openingFloatDefaultPaisa = patch.openingFloatDefaultPaisa;
    // DEC-GBL-002 — the rate is Finance's; the till does not get its own
    if (patch.giftReceiptHidePrice !== undefined) data.giftReceiptHidePrice = patch.giftReceiptHidePrice;
    if (patch.defaultCreditLimitPaisa !== undefined) data.defaultCreditLimitPaisa = patch.defaultCreditLimitPaisa;
    if (patch.receiptHeader !== undefined) data.receiptHeader = patch.receiptHeader;
    if (patch.receiptFooter !== undefined) data.receiptFooter = patch.receiptFooter;
    if (patch.enabledMethods !== undefined) (data as { enabledMethods?: string[] }).enabledMethods = patch.enabledMethods;
    return this.prisma.db.posSetting.update({ where: { id: s.id }, data });
  }

  /* ------------------------------------------------ registers */

  async registers() {
    const list = await this.prisma.db.posRegister.findMany({ orderBy: { code: 'asc' } });
    if (list.length) return list;
    /* POS-REV-1 — the third of them. `PosRegister.code` is @unique, and this is the
       FIRST call the till screen makes on load, so in dev a React effect fires it
       twice on mount and one of the two 500s. Exactly the shape of the 29 Jul bug. */
    const first = await ensureSingleton(
      () => this.prisma.db.posRegister.findFirst({ where: { code: 'COUNTER-1' } }),
      () => this.prisma.db.posRegister.create({ data: { code: 'COUNTER-1', name: 'Main Counter' } }),
    );
    return [first];
  }

  async createRegister(dto: CreateRegisterDto) {
    const count = await this.prisma.db.posRegister.count();
    const code = dto.code?.trim() || `COUNTER-${count + 1}`;
    return this.prisma.db.posRegister.create({ data: { code, name: dto.name.trim(), branchId: dto.branchId } });
  }

  /* ------------------------------------------------ shifts */

  async currentShift(registerId?: string) {
    return this.prisma.db.posShift.findFirst({
      where: { status: PosShiftStatus.OPEN, ...(registerId ? { registerId } : {}) },
      orderBy: { openedAt: 'desc' },
      include: { register: true, cashMovements: { where: { deletedAt: null } } },
    });
  }

  /**
   * P7-6 (31 Aug) — TWO DRAWERS COULD BE OPEN AT ONCE, and the older one could
   * never be closed from any screen.
   *
   * The clash was looked for PER REGISTER, but a shift could be created with no
   * register at all (nothing ever required one). `SHF-000001` was exactly that:
   * open since 20 Aug with `registerId = null`, holding eleven days of takings.
   * `/pos/shifts/current?registerId=COUNTER-1` could not see it, so the till
   * offered to open a second shift — and after that `currentShift()` (asked with
   * no register, which is how due collection and day-close ask) would hand the
   * cash to whichever opened LAST, leaving the first drawer stranded.
   *
   * Two doors to one fact, the shape this project keeps finding. So: a shift now
   * always carries a register, and a register-less one left over from before
   * blocks every register until somebody closes it.
   */
  async openShift(dto: OpenShiftDto) {
    if (!dto.cashierName?.trim()) throw new BadRequestException('cashierName is required');

    // always stamp a register — the counter it was opened on is part of the fact
    const registerId = dto.registerId ?? (await this.registers())[0]?.id ?? null;
    if (!registerId) throw new BadRequestException('no counter is set up yet — add one in POS settings');

    const clash = await this.prisma.db.posShift.findFirst({
      where: { status: PosShiftStatus.OPEN, OR: [{ registerId }, { registerId: null }] },
      include: { register: { select: { name: true } } },
    });
    if (clash) {
      throw new BadRequestException(
        clash.registerId
          ? `${clash.shiftNo} is already open on ${clash.register?.name ?? 'this counter'} (${clash.cashierName}) — close that shift first`
          : `${clash.shiftNo} is already open with no counter on it (${clash.cashierName}) — close it from Day-close before opening a new one`,
      );
    }

    const s = await this.settings();
    // POS-REV-2 — the number is allocated inside the retry, not before it
    const shift = await this.withNextNo(
      (skip) => this.nextShiftNo(skip),
      (shiftNo) => this.prisma.db.posShift.create({
        data: {
          shiftNo,
          registerId,
          cashierName: dto.cashierName.trim(),
          openingFloatPaisa: dto.openingFloatPaisa ?? s.openingFloatDefaultPaisa,
        },
      }),
    );
    await this.audit.record({ entityType: 'PosShift', entityId: shift.id, action: 'CREATE', actorName: dto.actorName ?? dto.cashierName });
    return shift;
  }

  /** Expected cash = opening float + cash sales − payouts/drops. */
  private async expectedCash(shiftId: string, openingFloatPaisa: number): Promise<number> {
    const moves = await this.prisma.db.posCashMovement.findMany({ where: { shiftId, deletedAt: null } });
    return moves.reduce((sum, m) => sum + m.amountPaisa, openingFloatPaisa);
  }

  /**
   * P7-1 (31 Aug) — what THIS shift took. The screen used to print today's
   * figure under the words "Sales this shift", which are not the same sentence:
   * `SHF-000001` sat open from 20 to 31 August, so the drawer said ৳15,156.76
   * while the panel beside it said "0 transactions". A cashier handing over a
   * drawer cannot reconcile against a number that belongs to the calendar.
   *
   * The shift owns the bills rung up on it (`Order.posShiftId`), so that is what
   * is counted here. The Overview keeps its "today" figure, where the word is true.
   */
  async shiftSummary(shiftId: string) {
    const shift = await this.prisma.db.posShift.findFirst({
      where: { id: shiftId },
      include: { register: true, cashMovements: { where: { deletedAt: null } } },
    });
    if (!shift) throw new NotFoundException('shift not found');

    const sales = await this.prisma.db.order.findMany({
      where: { posShiftId: shiftId, fulfillmentType: FulfillmentType.COUNTER },
      orderBy: { placedAt: 'desc' },
      select: {
        id: true, orderNo: true, placedAt: true, totalPaisa: true, duePaisa: true,
        paymentMethod: true, paymentStatus: true, salesStatus: true, senderName: true,
        customer: { select: { name: true } },
      },
    });

    const salesPaisa = sales.reduce((s, o) => s + o.totalPaisa, 0);
    const duePaisa = sales.reduce((s, o) => s + o.duePaisa, 0);
    return {
      shiftId,
      shiftNo: shift.shiftNo,
      cashierName: shift.cashierName,
      registerName: shift.register?.name ?? null,
      openedAt: shift.openedAt.toISOString(),
      openingFloatPaisa: shift.openingFloatPaisa,
      expectedCashPaisa: await this.expectedCash(shiftId, shift.openingFloatPaisa),
      salesPaisa,
      count: sales.length,
      avgPaisa: sales.length ? Math.round(salesPaisa / sales.length) : 0,
      duePaisa,
      sales: sales.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        placedAt: o.placedAt.toISOString(),
        customerName: o.customer?.name ?? o.senderName,
        totalPaisa: o.totalPaisa,
        duePaisa: o.duePaisa,
        paymentStatus: o.paymentStatus,
        salesStatus: o.salesStatus,
      })),
    };
  }

  async addCashMovement(shiftId: string, dto: CashMovementDto) {
    const shift = await this.prisma.db.posShift.findFirst({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('shift not found');
    if (shift.status !== PosShiftStatus.OPEN) throw new BadRequestException('shift is closed');
    /* POS-REV-7 (30 Jul) — the amount was never checked. A zero movement is a row that
       says nothing, and a fractional one puts a non-integer into a paisa column, which
       is the one discipline this whole codebase holds ("no floats anywhere in the
       money path"). Both then walk straight into the expected-cash sum at close. */
    if (!Number.isInteger(dto.amountPaisa) || dto.amountPaisa === 0) {
      throw new BadRequestException('Cash movement amount must be a non-zero whole number of paisa');
    }
    // PAYOUT/DROP remove cash → stored negative; ADJUSTMENT keeps its sign
    const signed = dto.kind === 'ADJUSTMENT' ? dto.amountPaisa : -Math.abs(dto.amountPaisa);
    return this.prisma.db.posCashMovement.create({
      data: { shiftId, kind: dto.kind as PosCashKind, amountPaisa: signed, note: dto.note, actorName: dto.actorName ?? shift.cashierName },
    });
  }

  /**
   * ═══ P7-2 — CASH LEAVING THE TILL (owner, 31 Aug 2026) ═══
   *
   * *"jkhon ja dorkar hobe cash theke ber krbe expance diye"* — money may come
   * out of the drawer whenever the shop needs it, and every withdrawal is
   * booked as an expense under a heading.
   *
   * ⚠️ What this replaces: `POST /pos/shifts/:id/cash` could write a PAYOUT that
   * changed the expected cash and **told Finance nothing** (there was no screen
   * for it either). So the only trace money had ever left was a shortage at
   * close — posted to `5700 Cash Short`, which reads as the cashier losing it.
   * A real expense recorded as a cashier's mistake is worse than no record.
   *
   * Ownership is unchanged (house rule 4): Finance writes the expense and the
   * journal; POS writes only the drawer movement, because the drawer is POS's
   * own fact. The two are tied by the document number in each other's note.
   */
  async takeCashOut(shiftId: string, dto: PosCashOutDto) {
    const shift = await this.prisma.db.posShift.findFirst({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('shift not found');
    if (shift.status !== PosShiftStatus.OPEN) throw new BadRequestException('shift is closed');
    if (!Number.isInteger(dto.amountPaisa) || dto.amountPaisa <= 0) {
      throw new BadRequestException('Amount must be a positive whole number of paisa');
    }
    const actorName = dto.actorName ?? shift.cashierName;

    /*  Which cash — asked the same way the till asks it (DEC-GBL-006). Walked
        31 Aug: this shop has TWO cash accounts, so hardcoding `1000` would have
        emptied a drawer the money never sat in. When there is only one the
        cashier is never bothered; when there are two, `resolveAccount` refuses
        with the same sentence the sell screen shows.  */
    const cashId = await this.payMethods.resolveAccount('cash', dto.fromAccountId);
    if (!cashId) throw new BadRequestException('no cash account is set up in Finance yet');
    const cash = { id: cashId };
    if (dto.kind === 'EXPENSE' && !dto.accountId) throw new BadRequestException('pick what this money was spent on');
    if (dto.kind !== 'EXPENSE') {
      if (!dto.toAccountId) throw new BadRequestException('pick where the cash is going');
      if (dto.toAccountId === cash.id) throw new BadRequestException('that is the drawer itself');
    }

    /*  ═══ THE DRAWER MOVES FIRST, AND IT IS COMPENSATED — audit 11 Sep 2026 §1 #8
        ═══════════════════════════════════════════════════════════════════════
        This used to write Finance first and the drawer second, with nothing
        holding the two together. If the movement failed after the expense had
        been booked, the books carried a cost the drawer never lost, expected
        cash was high by exactly that much, and the day closed as a shortage —
        posted to 5700 Cash Short, which reads as the cashier losing money.

        Finance runs on its own connection, so it cannot join a POS
        transaction. So the order is reversed: the drawer's own fact is written
        first, inside a transaction that also re-reads the balance and locks
        the shift (which is what stops two simultaneous cash-outs each passing
        a check the other invalidates — the other half of the same bug), and if
        Finance then refuses, the movement is reversed out again. A drawer
        movement with no expense behind it is visible and correctable; an
        expense with no drawer movement behind it is a phantom shortage nobody
        can explain.  */
    const { move, drawerAtStart } = await this.prisma.db.$transaction(async (tx) => {
      // lock the box: a second cash-out on this shift waits here until we commit
      const claimed = await tx.posShift.updateMany({
        where: { id: shiftId, status: PosShiftStatus.OPEN },
        data: { cashierName: shift.cashierName },
      });
      if (claimed.count !== 1) throw new BadRequestException('that drawer has been closed — open a new one');

      const moves = await tx.posCashMovement.findMany({ where: { shiftId, deletedAt: null }, select: { amountPaisa: true } });
      const inDrawer = moves.reduce((sum, m) => sum + m.amountPaisa, shift.openingFloatPaisa);
      if (dto.amountPaisa > inDrawer) {
        throw new BadRequestException(
          `only ${(inDrawer / 100).toFixed(2)} is in the drawer — you cannot take out ${(dto.amountPaisa / 100).toFixed(2)}`,
        );
      }
      const created = await tx.posCashMovement.create({
        data: {
          shiftId,
          kind: dto.kind === 'DROP' ? PosCashKind.DROP : PosCashKind.PAYOUT,
          amountPaisa: -dto.amountPaisa,
          note: [dto.note?.trim(), 'awaiting the Finance document'].filter(Boolean).join(' · '),
          actorName,
        },
      });
      return { move: created, drawerAtStart: inDrawer };
    });

    let docNo: string;
    try {
      if (dto.kind === 'EXPENSE') {
        if (!dto.accountId) throw new BadRequestException('pick what this money was spent on');
        const exp = await this.finance.createExpense({
          accountId: dto.accountId,
          paidFromId: cash.id,
          amountPaisa: dto.amountPaisa,
          payeeName: dto.payeeName ?? null,
          note: [dto.note?.trim(), `paid from the till · ${shift.shiftNo}`].filter(Boolean).join(' · '),
          actorName,
        });
        docNo = exp?.expenseNo ?? 'expense';
      } else {
        if (!dto.toAccountId) throw new BadRequestException('pick where the cash is going');
        const tr = await this.finance.createTransfer({
          fromId: cash.id,
          toId: dto.toAccountId,
          amountPaisa: dto.amountPaisa,
          note: [dto.note?.trim(), `taken out of the till · ${shift.shiftNo}`].filter(Boolean).join(' · '),
          actorName,
        });
        docNo = (tr as { transferNo?: string } | null)?.transferNo ?? 'transfer';
      }
    } catch (e) {
      /*  Finance refused — so the notes never left, and the drawer must say so
          again. The movement is buried rather than erased: what was attempted
          is part of the day's story.  */
      await this.prisma.db.posCashMovement.update({
        where: { id: move.id },
        data: { deletedAt: new Date(), note: `reversed — Finance refused this cash-out` },
      }).catch(() => undefined);
      throw e;
    }

    // the document number belongs on the drawer row, which is how the two are tied
    const stamped = await this.prisma.db.posCashMovement.update({
      where: { id: move.id },
      data: { note: [docNo, dto.note?.trim()].filter(Boolean).join(' · ') },
    });
    await this.audit.record({
      entityType: 'PosShift',
      entityId: shiftId,
      action: 'UPDATE',
      actorName,
      changes: { cashOut: dto.amountPaisa, kind: dto.kind, document: docNo },
    });
    return { movement: stamped, document: docNo, expectedCashPaisa: drawerAtStart - dto.amountPaisa };
  }

  /**
   * The open drawer, opening one if there is not one (owner, 11 Sep 2026).
   *
   * ⚠️ IT DOES NOT OPEN ONE PER DAY. A drawer left open from yesterday keeps
   * today's cash too, exactly as it did before — the money is physically in
   * the same box, and pretending otherwise would put a day's takings in a row
   * nobody counted. Day-close says how long the box has been open and counts
   * everything in it; that is the honest answer and the screen shows it.
   */
  private async openDrawerIfNeeded(actorName: string, registerId?: string) {
    const open = await this.currentShift(registerId);
    if (open) return open;
    return this.openShift({ cashierName: actorName, registerId });
  }

  /**
   * ── THE DAY — what came in today, and how (owner, 11 Sep 2026) ────────────
   *
   * One screen, one question: *"how much money came in today and how?"* It is
   * the Dhaka day (`bd-day.ts`), never the server's, and it counts MONEY THAT
   * ARRIVED TODAY — not what today's bills are worth. The two are different
   * whenever an old bill's due is paid at the counter this morning, and the
   * cash box only ever agrees with the first one.
   *
   * `bills` is the other half: what was sold today, which is what a shop
   * owner means by "how was today". Both are reported, never added together.
   */
  async day(dateStr?: string) {
    const at = dateStr ? new Date(`${dateStr}T06:00:00.000Z`) : new Date();
    const start = new Date(startOfBdDay(at));
    const end = new Date(startOfBdDay(at) + DAY_MS);
    const dayName = new Date(start.getTime() + BD_OFFSET_MS).toISOString().slice(0, 10);
    const todayName = new Date(startOfBdDay(new Date()) + BD_OFFSET_MS).toISOString().slice(0, 10);

    /* ---- what was SOLD today: counter bills placed inside the day ---- */
    const bills = await this.prisma.db.order.findMany({
      where: {
        fulfillmentType: FulfillmentType.COUNTER,
        deletedAt: null,
        placedAt: { gte: start, lt: end },
      },
      select: {
        id: true, orderNo: true, placedAt: true, totalPaisa: true, duePaisa: true,
        paidPaisa: true, vatPaisa: true, discountPaisa: true,
        customer: { select: { name: true } },
      },
      orderBy: { placedAt: 'desc' },
    });
    const salesPaisa = bills.reduce((n, b) => n + b.totalPaisa, 0);
    const billDuePaisa = bills.reduce((n, b) => n + b.duePaisa, 0);

    /*  ---- what MONEY arrived today, by method ----
        Every counter payment stamped inside the day, whichever bill it
        belongs to: today's sales AND an older bill's due paid at the counter
        this morning. A refund is money going the other way, so it is counted
        apart and never netted into a tender's figure without saying so.  */
    const txns = await this.prisma.db.paymentTransaction.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: start, lt: end },
        order: { fulfillmentType: FulfillmentType.COUNTER, deletedAt: null },
      },
      select: { method: true, amountPaisa: true, kind: true, orderId: true },
    });
    const byMethod = new Map<string, { paisa: number; count: number }>();
    let takenPaisa = 0;
    let refundedPaisa = 0;
    for (const t of txns) {
      if (t.kind === PaymentTxnKind.REFUND) { refundedPaisa += t.amountPaisa; continue; }
      const key = String(t.method);
      const cur = byMethod.get(key) ?? { paisa: 0, count: 0 };
      cur.paisa += t.amountPaisa;
      cur.count += 1;
      byMethod.set(key, cur);
      takenPaisa += t.amountPaisa;
    }
    const methods = [...byMethod.entries()]
      .map(([method, v]) => ({ method, paisaTotal: v.paisa, count: v.count }))
      .sort((a, b) => b.paisaTotal - a.paisaTotal);
    /*  money that came in against a bill from an earlier day — the number that
        explains why the cash box and today's sales do not match  */
    const billIds = new Set(bills.map((b) => b.id));
    const olderBillPaisa = txns
      .filter((t) => t.kind !== PaymentTxnKind.REFUND && t.orderId && !billIds.has(t.orderId))
      .reduce((n, t) => n + t.amountPaisa, 0);

    /* ---- the cash box ---- */
    const drawer = await this.currentShift();
    const moves = drawer
      ? await this.prisma.db.posCashMovement.findMany({
          where: { shiftId: drawer.id, deletedAt: null },
          select: { kind: true, amountPaisa: true, note: true, createdAt: true, actorName: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const cashOutToday = moves
      .filter((m) => m.createdAt >= start && m.createdAt < end && m.amountPaisa < 0)
      .reduce((n, m) => n + Math.abs(m.amountPaisa), 0);
    const expectedCashPaisa = drawer
      ? moves.reduce((n, m) => n + m.amountPaisa, drawer.openingFloatPaisa)
      : 0;
    const openedAt = drawer?.openedAt ?? null;
    /*  a box open since before today holds more than today's cash — the screen
        has to say so, or the count will look wrong to the person doing it  */
    const openedOn = openedAt
      ? new Date(startOfBdDay(openedAt) + BD_OFFSET_MS).toISOString().slice(0, 10)
      : null;

    /* ---- what sold, by item: the other half of "how was today" ---- */
    const lines = bills.length
      ? await this.prisma.db.orderLine.groupBy({
          by: ['name'],
          where: { orderId: { in: bills.map((b) => b.id) }, deletedAt: null },
          _sum: { qty: true, linePaisa: true },
          orderBy: { _sum: { linePaisa: 'desc' } },
          take: 10,
        })
      : [];

    return {
      date: dayName,
      isToday: dayName === todayName,
      bills: {
        count: bills.length,
        salesPaisa,
        avgPaisa: bills.length ? Math.round(salesPaisa / bills.length) : 0,
        duePaisa: billDuePaisa,
        vatPaisa: bills.reduce((n, b) => n + (b.vatPaisa ?? 0), 0),
        discountPaisa: bills.reduce((n, b) => n + b.discountPaisa, 0),
        rows: bills.slice(0, 50).map((b) => ({
          id: b.id, orderNo: b.orderNo, placedAt: b.placedAt,
          customerName: b.customer?.name ?? 'Walk-in Customer',
          totalPaisa: b.totalPaisa, duePaisa: b.duePaisa,
        })),
      },
      money: {
        takenPaisa,
        refundedPaisa,
        olderBillPaisa,
        cashOutPaisa: cashOutToday,
        methods,
      },
      drawer: drawer
        ? {
            isOpen: true,
            /* the cash box's own id — "take cash out" still posts against it */
            id: drawer.id,
            shiftNo: drawer.shiftNo,
            openedAt,
            openedOn,
            openedBeforeToday: !!openedOn && openedOn !== dayName,
            cashierName: drawer.cashierName,
            openingFloatPaisa: drawer.openingFloatPaisa,
            expectedCashPaisa,
            movements: moves.slice(0, 30).map((m) => ({
              kind: String(m.kind), amountPaisa: m.amountPaisa,
              note: m.note, at: m.createdAt, actorName: m.actorName,
            })),
          }
        : { isOpen: false },
      topItems: lines.map((l) => ({
        name: l.name,
        qty: l._sum.qty ?? 0,
        paisa: l._sum.linePaisa ?? 0,
      })),
    };
  }

  /**
   * Close the day: count the box, and the drawer behind it closes with the
   * figure (owner, 11 Sep 2026). Nothing else about closing changed — the
   * over/short still reaches Finance through `onPosShiftClosed`.
   */
  async closeDay(dto: CloseShiftDto) {
    const drawer = await this.currentShift();
    if (!drawer) throw new BadRequestException('There is no open cash box to close — nothing has been sold since the last close.');
    return this.closeShift(drawer.id, dto);
  }

  async closeShift(shiftId: string, dto: CloseShiftDto) {
    const shift = await this.prisma.db.posShift.findFirst({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('shift not found');
    if (shift.status !== PosShiftStatus.OPEN) throw new BadRequestException('shift already closed');
    const expected = await this.expectedCash(shiftId, shift.openingFloatPaisa);
    const over = dto.countedCashPaisa - expected;
    const closed = await this.prisma.db.posShift.update({
      where: { id: shiftId },
      data: {
        status: PosShiftStatus.CLOSED,
        closedAt: new Date(),
        expectedCashPaisa: expected,
        countedCashPaisa: dto.countedCashPaisa,
        overShortPaisa: over,
        closeNote: dto.note,
      },
    });
    await this.audit.record({ entityType: 'PosShift', entityId: shiftId, action: 'UPDATE', actorName: dto.actorName ?? shift.cashierName, changes: { expected, counted: dto.countedCashPaisa, over } });
    // Finance consumes the completed shift close (DEC-POS-010) — POS never writes the ledger itself
    await this.book(shiftId, `shift close ${shift.shiftNo}`, () => this.financeEvents.onPosShiftClosed(shiftId), dto.actorName ?? shift.cashierName);
    return closed;
  }

  /* ------------------------------------------------ discount rules (DEC-POS-006) */

  async discountRules() {
    return this.prisma.db.posDiscountRule.findMany({ where: { deletedAt: null } });
  }

  async replaceDiscountRules(rules: DiscountRuleInput[]) {
    await this.prisma.db.posDiscountRule.updateMany({ where: { deletedAt: null }, data: { deletedAt: new Date() } });
    for (const r of rules) {
      /*  (POS audit 11 Sep 2026 §3 #15) — the item half is now WRITABLE. The
          two columns have existed since DEC-POS-018 and `cartDiscountCap`
          already read them, but this write only ever set the product/category
          pair — so on a counter where every line is an Item (which is every
          modern counter line) no rule could ever match and the cap was always
          100%. The whole DEC-POS-006 feature did nothing.  */
      const pct = Math.round(r.maxPercent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new BadRequestException('A discount cap is a whole percent between 0 and 100');
      }
      await this.prisma.db.posDiscountRule.create({
        data: {
          categoryId: r.categoryId ?? null,
          productId: r.productId ?? null,
          ...({ itemId: r.itemId ?? null, itemCategoryId: r.itemCategoryId ?? null } as object),
          maxPercent: pct,
          requiresApproval: r.requiresApproval,
        },
      });
    }
    return this.discountRules();
  }

  /**
   * Strictest cap across the cart; unconfigured = 100 (no block).
   *
   * DEC-POS-018 — a counter line sells an Item, so a rule can now also be written
   * against an item or its item category. A rule written against a website product
   * still applies to the legacy product line, exactly as before.
   */
  private async cartDiscountCap(productIds: string[], itemIds: string[] = []): Promise<number> {
    const rules = await this.discountRules();
    if (!rules.length) return 100;
    let cap = 100;

    if (productIds.length) {
      const products = await this.prisma.db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, category: { select: { id: true } } } });
      for (const p of products) {
        const override = rules.find((r) => r.productId === p.id);
        const catRule = p.category ? rules.find((r) => r.categoryId === p.category!.id) : undefined;
        const rule = override ?? catRule;
        if (rule) cap = Math.min(cap, rule.maxPercent);
      }
    }

    if (itemIds.length) {
      const items = await this.prisma.db.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, itemCategoryId: true },
      });
      for (const it of items) {
        const rule =
          rules.find((r) => (r as { itemId?: string | null }).itemId === it.id) ??
          (it.itemCategoryId
            ? rules.find((r) => (r as { itemCategoryId?: string | null }).itemCategoryId === it.itemCategoryId)
            : undefined);
        if (rule) cap = Math.min(cap, rule.maxPercent);
      }
    }

    return cap;
  }

  /* ---------------- the over-cap gate (POS audit 11 Sep 2026 §1 #7 / §3 #17) ---------------- */

  /**
   * Does this PIN belong to this account?
   *
   * ⚠️ KNOWN GAP, say it out loud: the shop's one PIN checker lives in
   * `AuthService`, which the POS module cannot reach from here (POS imports
   * Inventory, Finance and Returns only, and pulling Auth in for one call would
   * invert the dependency the access guard depends on). So this reads
   * `AppUser.pinHash` directly and understands the salted hash formats this
   * codebase writes. It REFUSES anything it cannot verify rather than waving it
   * through — a gate that fails open is not a gate. When POS can reach the auth
   * checker, this method becomes one line and should.
   */
  private verifyPinHash(pin: string, hash: string): boolean {
    const safeEq = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);
    const parts = hash.includes('$') ? hash.split('$') : hash.split(':');

    if (parts.length === 3 && (parts[0] === 'scrypt' || parts[0] === 'sha256')) {
      const [algo, salt, digest] = parts;
      const want = Buffer.from(digest, 'hex');
      if (!want.length) return false;
      const got =
        algo === 'scrypt'
          ? scryptSync(pin, salt, want.length)
          : createHash('sha256').update(`${salt}${pin}`).digest();
      return safeEq(got, want);
    }
    if (/^[0-9a-f]{64}$/i.test(hash)) {
      return safeEq(createHash('sha256').update(pin).digest(), Buffer.from(hash, 'hex'));
    }
    /*  bcrypt ($2a/$2b/$2y) and anything else this method has not been taught:
        it cannot be checked here, and guessing is not an option where money is.  */
    return false;
  }

  /**
   * The over-cap discount gate, moved off the browser.
   *
   * What it replaces: `MANAGER_PIN = "1234"` shipped inside the admin bundle —
   * anybody who opened the page source could clear any cap — and the server
   * then accepted ANY non-empty `discountApprovedBy` string and threw the name
   * away. Neither half was an approval.
   *
   * Now: the manager's PIN is checked against a live OWNER/MANAGER account, and
   * what the till gets back is a one-shot token, not a permission. The token is
   * burned by the bill that uses it, so one approval clears one sale.
   */
  async approveDiscount(dto: PosDiscountApproveDto, actor?: { id?: string; name?: string; role?: string }) {
    const pin = String(dto.pin ?? '').trim();
    if (!pin) throw new ForbiddenException('Enter the manager PIN');
    if (!actor?.id) throw new ForbiddenException('Sign in before approving a discount over the cap');

    const user = await this.prisma.db.appUser.findFirst({
      where: { id: actor.id, isActive: true },
      select: { id: true, name: true, role: true, pinHash: true },
    });
    /*  the role is read from the DATABASE, not from the token the till is
        holding — a stale session must not be able to approve anything  */
    if (!user || (user.role !== 'OWNER' && user.role !== 'MANAGER')) {
      throw new ForbiddenException('Only an owner or a manager can approve a discount over the cap');
    }
    if (!user.pinHash) {
      throw new ForbiddenException(`${user.name} has no PIN set yet — set one in People before approving money actions`);
    }
    if (!this.verifyPinHash(pin, user.pinHash)) {
      throw new ForbiddenException('That PIN is not right');
    }

    const token = randomUUID();
    /*  ten minutes: long enough to walk to the counter, short enough that an
        approval cannot sit in an open tab all afternoon  */
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const pct = dto.requestedPercent != null ? Math.round(dto.requestedPercent) : null;
    const row = await this.prisma.db.posDiscountApproval.create({
      data: {
        token,
        approvedById: user.id,
        approvedByName: user.name,
        ...(pct != null && Number.isFinite(pct) ? { requestedPercent: pct } : {}),
        expiresAt,
      },
    });
    await this.audit.event({
      entityType: 'PosDiscountApproval',
      entityId: row.id,
      kind: 'sales',
      label: `Over-cap discount approved by ${user.name}${pct != null ? ` (${pct}%)` : ''}`,
      actorName: dto.actorName ?? user.name,
    });
    return { ok: true as const, approvedBy: user.name, token, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Burn an approval token for this bill, inside the sale's own transaction.
   *
   * A guarded `updateMany` and `count === 1`, the same one-winner shape as
   * every other claim in this file: two tills cannot spend one approval, and a
   * double-clicked sale cannot spend it twice.
   */
  private async burnApproval(
    tx: Prisma.TransactionClient,
    token: string,
    orderId: string,
  ): Promise<{ approvedById: string; approvedByName: string }> {
    const row = await tx.posDiscountApproval.findFirst({ where: { token } });
    if (!row) throw new ForbiddenException('That approval is not one this shop issued — ask a manager to approve again');
    if (row.usedAt) throw new ForbiddenException('That approval has already been used on another bill');
    if (row.expiresAt.getTime() < Date.now()) throw new ForbiddenException('That approval has expired — ask a manager to approve again');
    const claimed = await tx.posDiscountApproval.updateMany({
      where: { token, usedAt: null },
      data: { usedAt: new Date(), usedOrderId: orderId },
    });
    if (claimed.count !== 1) throw new ForbiddenException('That approval has already been used on another bill');
    return { approvedById: row.approvedById, approvedByName: row.approvedByName };
  }

  /* ------------------------------------------------ catalogue (DEC-POS-018) */

  /**
   * What the till may sell: every item marked "We sell it", services included.
   *
   * Products are deliberately absent. The website's shelf is a listing on top of
   * these same items, and offering both would put one thing on the screen twice —
   * with two prices and two ways for stock to leave.
   *
   * The price is worked out exactly as the item screen works it out (DEC-ITM-023),
   * because a cashier reading a different number from the owner is how arguments start.
   */
  /**
   * (POS audit 11 Sep 2026 §3 #13) — the search is answered HERE now.
   *
   * The till used to pull 500 items once, filter them in the browser and then
   * slice the result to 60: item 501 could not be sold at all, and the search
   * box only ever looked at whatever happened to be loaded. `search` was
   * already a query parameter and already reached this method — the screen
   * simply never sent it. `limit` is the other half, so the till asks for a
   * page instead of the shelf.
   */
  async catalogue(search?: string, limit?: number) {
    const take = Math.min(Math.max(1, Math.round(limit ?? 100)), 500);
    const rows = await this.prisma.db.item.findMany({
      where: {
        isSaleable: true,
        isActive: true,
        ...(search?.trim()
          ? {
              OR: [
                { name: { contains: search.trim(), mode: 'insensitive' as const } },
                { sku: { contains: search.trim(), mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true, sku: true, name: true, imageUrl: true, itemType: true,
        isStockTracked: true, unitId: true,
        costMode: true, standardCostPaisa: true, computedCostPaisa: true,
        minMarginBp: true, minMarginPaisa: true,
        itemCategory: { select: { id: true, name: true } },
        unit: { select: { name: true, shortCode: true, baseQty: true, baseUnit: { select: { id: true, name: true } } } },
        ...({ sellingPricePaisa: true, markupBp: true } as object),
      },
      orderBy: { name: 'asc' },
      take,
    });

    /*  What is actually on the shelf. The till showed a teddy with nothing behind it
        and said nothing (owner, 20 Aug) — a counter screen that hides the shortage is
        worse than one that has no stock figure at all, because the cashier promises
        something the shop cannot hand over. Services are not counted and say so.  */
    const stock = await this.prisma.db.inventoryStock.groupBy({
      by: ['itemId'],
      where: { itemId: { in: rows.map((r) => r.id) } },
      _sum: { qtyMilli: true },
    });
    const onHand = new Map(stock.map((s) => [s.itemId, s._sum.qtyMilli ?? 0]));

    const defaultMarkupBp = await this.itemMarkupBp();
    return rows.map((r) => {
      const it = r as typeof r & { sellingPricePaisa?: number | null; markupBp?: number | null };
      const cost = it.costMode === 'AUTO' ? (it.computedCostPaisa ?? it.standardCostPaisa) : it.standardCostPaisa;
      const auto = cost > 0 ? Math.round(cost * (1 + (it.markupBp ?? defaultMarkupBp) / 10_000)) : null;
      const floor = it.minMarginBp
        ? Math.round(cost * (1 + it.minMarginBp / 10_000))
        : it.minMarginPaisa
          ? cost + it.minMarginPaisa
          : null;
      return {
        id: it.id,
        sku: it.sku,
        name: it.name,
        imageUrl: it.imageUrl,
        itemType: it.itemType,
        unitName: it.unit?.name ?? null,
        unitId: it.unitId ?? null,
        baseUnitId: it.unit?.baseUnit?.id ?? null,
        baseUnitName: it.unit?.baseUnit?.name ?? null,
        baseQty: it.unit?.baseUnit ? Math.max(it.unit.baseQty, 1) : null,
        /*  the conversion, spelled out — "1 Stick = 4 Pice". The counter sells in
            the item's unit; the cashier should not have to remember what that
            unit breaks into (owner, 26 Aug: "unit a thakle tar base o dekha
            jawa dorkar chilo").  */
        unitBase: it.unit?.baseUnit
          ? `1 ${it.unit.name} = ${it.unit.baseQty} ${it.unit.baseUnit.name}`
          : null,
        categoryId: it.itemCategory?.id ?? null,
        categoryName: it.itemCategory?.name ?? null,
        /** what the till charges; null = nobody has priced it yet */
        pricePaisa: it.sellingPricePaisa ?? auto,
        priceIsFixed: it.sellingPricePaisa != null,
        /** what the shop paid — the cashier haggles against this (owner, 20 Aug) */
        costPaisa: cost,
        /** the least it may go for — the till refuses under this */
        floorPricePaisa: floor,
        /*  null = not counted (a service); otherwise the whole shop's on-hand.
            Rounded DOWN (audit 11 Sep 2026): 0.6 of a unit used to show as
            "1 left", the cart let it through, and the server then refused the
            sale with "not enough stock". A sellable figure never rounds up.  */
        stockQty: it.isStockTracked ? Math.floor((onHand.get(it.id) ?? 0) / 1000) : null,
      };
    });
  }

  /**
   * (POS audit 11 Sep 2026 §3 #14) — counter customer lookup, answered by the
   * server.
   *
   * The picker used to load the first 100 customers and search them in the
   * browser, so a regular past #100 was simply unfindable at the counter. The
   * cashier then typed the phone again, `resolveCustomer` upserted, and the
   * same person's due and credit history split in two. Phone and name, at most
   * 25 rows, with what each one already owes the counter — which is the figure
   * the cashier wants before ringing anything up.
   */
  async customers(search?: string, limit?: number) {
    const take = Math.min(Math.max(1, Math.round(limit ?? 25)), 25);
    const q = search?.trim();
    const rows = await this.prisma.db.customer.findMany({
      where: {
        AND: [
          // the anonymous walk-in row is not a person anybody looks up
          { phone: { not: 'WALK-IN' } },
          q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' as const } },
                  { phone: { contains: q } },
                ],
              }
            : {},
        ],
      },
      select: { id: true, name: true, phone: true },
      orderBy: q ? { name: 'asc' } : { lastOrderAt: 'desc' },
      take,
    });
    if (!rows.length) return [];

    const dues = await this.prisma.db.order.groupBy({
      by: ['customerId'],
      where: {
        customerId: { in: rows.map((r) => r.id) },
        fulfillmentType: FulfillmentType.COUNTER,
        duePaisa: { gt: 0 },
      },
      _sum: { duePaisa: true },
    });
    const owed = new Map(dues.map((d) => [d.customerId, d._sum.duePaisa ?? 0]));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      outstandingPaisa: owed.get(r.id) ?? 0,
    }));
  }

  /** DEC-ITM-023 — the shop's default profit percent, the same row the Item module reads */
  private async itemMarkupBp(): Promise<number> {
    const row = await (this.prisma.db as unknown as {
      itemSetting: { findFirst(): Promise<{ defaultMarkupBp: number } | null> };
    }).itemSetting.findFirst();
    return row?.defaultMarkupBp ?? 2000;
  }

  /* ------------------------------------------------ SALE (DEC-POS-001) */

  /**
   * Spread a bill-level discount across its lines, pro-rata by line value, with
   * the rounding remainder on the largest line (audit 11 Sep 2026 §1 #6).
   *
   * The invariant is exact and is the whole point: the parts add up to the
   * whole, so Returns can value a returned line at what the customer actually
   * paid for it. A line is never discounted below zero.
   */
  private spreadDiscountOverLines(
    lines: { linePaisa: number; discountPaisa?: number }[],
    discountPaisa: number,
  ) {
    for (const l of lines) l.discountPaisa = 0;
    if (discountPaisa <= 0 || !lines.length) return;
    const total = lines.reduce((s, l) => s + l.linePaisa, 0);
    if (total <= 0) return;

    let given = 0;
    let biggest = 0;
    for (let i = 0; i < lines.length; i++) {
      const share = Math.min(lines[i].linePaisa, Math.floor((discountPaisa * lines[i].linePaisa) / total));
      lines[i].discountPaisa = share;
      given += share;
      if (lines[i].linePaisa > lines[biggest].linePaisa) biggest = i;
    }
    // the remainder (rounding, always small) lands on the largest line
    let left = discountPaisa - given;
    if (left > 0) {
      const room = lines[biggest].linePaisa - (lines[biggest].discountPaisa ?? 0);
      const put = Math.min(left, room);
      lines[biggest].discountPaisa = (lines[biggest].discountPaisa ?? 0) + put;
      left -= put;
      // a fully-discounted biggest line: walk the rest rather than lose a paisa
      for (let i = 0; left > 0 && i < lines.length; i++) {
        const space = lines[i].linePaisa - (lines[i].discountPaisa ?? 0);
        const add = Math.min(left, space);
        lines[i].discountPaisa = (lines[i].discountPaisa ?? 0) + add;
        left -= add;
      }
    }
  }

  /**
   * ═══ IS IT ON THE SHELF — audit 11 Sep 2026 §1 #2 ══════════════════════════
   *
   * POS-R14: the counter cannot sell what is not there. The check itself was
   * never wrong; WHEN it ran was. It ran once, before the transaction, and the
   * stock left after it — so two tills ringing up the last stem both passed and
   * both sold it.
   *
   * This is now called twice: once early for a readable refusal, and again
   * INSIDE the sale's transaction, where it is binding. The in-transaction call
   * first takes a write lock on every stock row it is about to judge (a
   * zero-delta update — Postgres locks the row and holds it to commit), so a
   * second till asking the same question waits here rather than racing past.
   *
   * ⚠️ WHY POS DOES NOT SIMPLY DECREMENT HERE, and what is still open.
   * INV-RULE-001: Inventory owns stock, and `postSaleForOrder` writes the
   * movement ledger as well as the balance. Decrementing `InventoryStock` from
   * POS would either double-count (Inventory deducts again straight after) or
   * leave a balance with no movement behind it, which is a worse corruption
   * than the race. `postSaleForOrder` takes no `tx` — every caller in this tree
   * (orders.service, returns.service) proves that — so it cannot join this
   * transaction. What closes the hole instead is the lock above plus the
   * COMPENSATION in `createSale`: the Inventory call is no longer fail-soft, so
   * a bill whose stock did not move is voided rather than left standing.
   * The remaining window is between COMMIT and that call, milliseconds wide.
   * Closing it properly needs `postSaleForOrder(tx)` — see POS_A.md.
   */
  private async assertStock(
    client: Prisma.TransactionClient,
    tracked: { id: string; name: string; unitName: string }[],
    wantedMilli: Map<string, number>,
    lockFirst = false,
  ) {
    const ids = tracked.map((t) => t.id);
    if (!ids.length) return;
    if (lockFirst) {
      /*  a zero-delta write: it changes no number and takes the row lock that
          makes the read below true until this transaction commits  */
      await client.inventoryStock.updateMany({
        where: { itemId: { in: ids } },
        data: { qtyMilli: { decrement: 0 } },
      });
    }
    const held = await client.inventoryStock.groupBy({
      by: ['itemId'],
      where: { itemId: { in: ids } },
      _sum: { qtyMilli: true },
    });
    const onHand = new Map(held.map((h) => [h.itemId, h._sum.qtyMilli ?? 0]));
    const short = tracked
      .map((i) => ({ name: i.name, unit: i.unitName, want: wantedMilli.get(i.id) ?? 0, have: onHand.get(i.id) ?? 0 }))
      .filter((x) => x.want > x.have);
    if (short.length) {
      throw new BadRequestException(
        `not enough stock: ${short.map((x) => `${x.name} (want ${x.want / 1000} ${x.unit}, have ${x.have / 1000} ${x.unit})`.trim()).join('; ')}`,
      );
    }
  }

  /** the bill a repeated `idempotencyKey` already became (audit §1 #1) */
  private async findByIdempotencyKey(key: string) {
    return this.prisma.db.order.findFirst({
      where: { ...({ posIdempotencyKey: key } as object) },
      include: { lines: true, transactions: true, customer: { select: { id: true, name: true, phone: true } } },
    });
  }

  async createSale(dto: CreatePosSaleDto) {
    if (!dto.lines?.length) throw new BadRequestException('add at least one item');
    const actorName = dto.actorName ?? 'Cashier';

    /*  ═══ ONE ATTEMPT, ONE BILL — audit 11 Sep 2026 §1 #1 ═══════════════════
        A double-clicked "Complete sale" (or a slow link the cashier retried)
        posted the whole sale twice: two receipt numbers, two sets of lines,
        two stock deductions and two sets of tenders for money taken once. The
        drawer then expects double and day-close reads as a shortage nobody can
        explain. The till sends one uuid per ATTEMPT and re-sends it on every
        retry of that attempt; the same key never becomes a second bill. The
        cheap check is here, and the real promise is the unique index — two
        clicks arriving together both pass this read, and the loser is caught
        at INSERT and turned into the original bill below.  */
    const idemKey = dto.idempotencyKey?.trim() || null;
    if (idemKey) {
      if (idemKey.length > 100) throw new BadRequestException('idempotencyKey is too long');
      const already = await this.findByIdempotencyKey(idemKey);
      /*  the change was handed over on the first attempt; a repeat reports none  */
      if (already) return { ...already, changePaisa: already.posChangePaisa ?? 0 };
    }

    /*  audit 11 Sep 2026 §1 #10 — every money field at the door, not only the
        tenders. All of these land in Int columns.  */
    if (dto.discountPaisa !== undefined) this.assertPaisa('Discount', dto.discountPaisa);
    if (dto.adjustmentPaisa !== undefined) this.assertPaisa('Adjustment', dto.adjustmentPaisa, { signed: true });
    if (dto.storeCreditPaisa !== undefined) this.assertPaisa('Store credit', dto.storeCreditPaisa);
    for (const l of dto.lines) {
      if (!Number.isInteger(l.qty)) throw new BadRequestException('A line quantity must be a whole number');
      if (l.unitPaisa !== undefined) this.assertPaisa('A line price', l.unitPaisa);
    }

    /*  ═══ NOBODY OPENS A DRAWER HERE — owner, 11 Sep 2026 ═══════════════════

        > *"Separate shift, drawer — our business does not need these. There
        >  will be a Day close, and clicking it shows how much money came in
        >  today and how."*

        One counter, one person, one day. The till used to refuse the first
        sale of the morning with "open a shift before selling" and make
        somebody type a float before the shop could take money. The drawer is
        still the row every cash movement hangs off — Finance, the cash-out
        and the returns refund all reach for it — so it is opened HERE, by the
        first sale of the day, with the float the settings screen already
        holds. Nobody is asked anything.  */
    const shift = dto.shiftId
      ? await this.prisma.db.posShift.findFirst({ where: { id: dto.shiftId } })
      : await this.openDrawerIfNeeded(actorName, dto.registerId);
    if (!shift || shift.status !== PosShiftStatus.OPEN) throw new BadRequestException('that drawer is already closed');

    /*  DEC-POS-018 — the counter's catalogue is the ITEM list. A line names an item;
        `productId` is only still accepted so an older till keeps working.  */
    const itemIds = dto.lines.map((l) => l.itemId).filter((v): v is string => !!v);
    const productIds = dto.lines.map((l) => l.productId).filter((v): v is string => !!v);

    const items = itemIds.length
      ? await this.prisma.db.item.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true, name: true, isSaleable: true, isActive: true, itemType: true,
            isStockTracked: true, unitId: true,
            unit: { select: { id: true, name: true, baseQty: true, baseUnit: { select: { id: true, name: true } } } },
            standardCostPaisa: true, computedCostPaisa: true, costMode: true,
            minMarginBp: true, minMarginPaisa: true,
            ...({ sellingPricePaisa: true, markupBp: true } as object),
          },
        })
      : [];
    const iMap = new Map(items.map((i) => [i.id, i as typeof i & { sellingPricePaisa?: number | null; markupBp?: number | null }]));

    /*  DEC-POS-024 — a line may be sold in the item's own unit or its DIRECT
        base, nothing else (the counter mirror of DEC-PUR-013). Returns the
        divisor to the item's own unit: 1, or the unit's baseQty.  */
    const lineUnitFactor = (l: { itemId?: string; unitId?: string }): number => {
      if (!l.itemId || !l.unitId) return 1;
      const it = iMap.get(l.itemId);
      if (!it) return 1;
      if (l.unitId === it.unitId) return 1;
      if (it.unit?.baseUnit && l.unitId === it.unit.baseUnit.id) return Math.max(it.unit.baseQty, 1);
      throw new BadRequestException(
        `"${it.name}" is counted in ${it.unit?.name ?? 'its own unit'}${it.unit?.baseUnit ? ` and may also be sold by the ${it.unit.baseUnit.name}` : ''} — nothing else can go on this line (DEC-POS-024)`,
      );
    };
    const defaultMarkupBp = itemIds.length ? await this.itemMarkupBp() : 2000;

    const products = productIds.length
      ? await this.prisma.db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, productType: true, sellingPricePaisa: true, discountType: true, discountValue: true, discountStartsAt: true, discountEndsAt: true, stockMode: true },
        })
      : [];
    const pMap = new Map(products.map((p) => [p.id, p]));

    /*  POS-R14 (owner, 20 Aug) — the counter cannot sell what is not on the shelf.
        The website may take an order for something that has run out (DEC-INV-011
        ALLOW_WARN, so a bouquet can still be promised for tomorrow); a customer
        standing at the till cannot walk out with air. Services are not counted.  */
    /*  in item-unit MILLI — a line sold by the base unit only weighs its
        fraction of the counting unit (2 Pice of a 4-Pice Stick = 500)  */
    const wantedMilli = new Map<string, number>();
    for (const l of dto.lines) {
      if (!l.itemId) continue;
      const f = lineUnitFactor(l);
      wantedMilli.set(l.itemId, (wantedMilli.get(l.itemId) ?? 0) + Math.round((Math.max(0, l.qty ?? 0) * 1000) / f));
    }
    const trackedItems = items
      .filter((i) => i.isStockTracked)
      .map((i) => ({ id: i.id, name: i.name, unitName: i.unit?.name ?? '' }));
    // the friendly refusal, before any work is done; the binding one is inside the transaction
    if (trackedItems.length) {
      await this.assertStock(this.prisma.db as unknown as Prisma.TransactionClient, trackedItems, wantedMilli);
    }

    const lineData: Prisma.OrderLineCreateWithoutOrderInput[] = dto.lines.map((l) => {
      if (!l.qty || l.qty < 1) throw new BadRequestException('line qty must be >= 1');

      /* ---- the counter's own path: an Item ---- */
      if (l.itemId) {
        const it = iMap.get(l.itemId);
        if (!it) throw new BadRequestException(`itemId ${l.itemId} not found`);
        if (!it.isSaleable || !it.isActive) {
          throw new BadRequestException(`"${it.name}" is not on sale — switch on "We sell it" first`);
        }
        /*  the price the item screen shows, worked out the same way (DEC-ITM-023):
            a fixed price if it has one, else cost + profit%.  */
        const cost =
          it.costMode === 'AUTO' ? (it.computedCostPaisa ?? it.standardCostPaisa) : it.standardCostPaisa;
        const markupBp = it.markupBp ?? defaultMarkupBp;
        const auto = cost > 0 ? Math.round(cost * (1 + markupBp / 10_000)) : null;
        /*  DEC-POS-024 — everything money below is PER THE CHOSEN UNIT. Selling
            by the base divides the listed price and the floor by the exact
            factor (floor rounds UP — a floor that rounds down leaks margin).  */
        const factor = lineUnitFactor(l);
        const listedOwn = it.sellingPricePaisa ?? auto;
        const listed = listedOwn == null ? null : factor === 1 ? listedOwn : Math.round(listedOwn / factor);
        const unitPaisa = l.unitPaisa ?? listed ?? 0;
        if (unitPaisa <= 0) {
          throw new BadRequestException(
            `"${it.name}" has no counter price yet — set one on the item, or type the price on the line`,
          );
        }
        /*  DEC-ITM-018 — the floor is the whole point of the floor: the till may
            haggle, but never under what the owner said he would accept.  */
        const floorOwn = it.minMarginBp
          ? Math.round(cost * (1 + it.minMarginBp / 10_000))
          : it.minMarginPaisa
            ? cost + it.minMarginPaisa
            : null;
        const floor = floorOwn == null ? null : factor === 1 ? floorOwn : Math.ceil(floorOwn / factor);
        if (floor !== null && unitPaisa < floor) {
          throw new BadRequestException(
            `"${it.name}" cannot be sold under ${(floor / 100).toFixed(2)} — that is its minimum`,
          );
        }
        const soldUnit = factor === 1 ? it.unit : it.unit?.baseUnit ?? null;
        /*  cast: the generated client on a machine that has not run BUILD_CHECK.bat
            still thinks a line must have a product (DEC-POS-018 made it optional)  */
        return {
          item: { connect: { id: it.id } },
          name: it.name,
          addonLabels: [],
          // a counter line is what it is; the enum only exists for website products
          productType: 'READYMADE' as ProductType,
          qty: l.qty,
          /*  DEC-POS-024 snapshots — the receipt's unit wording and the qty in
              the item's own counting unit, fixed at sale time (PUR-R03 twin)  */
          ...({
            unitId: soldUnit?.id ?? null,
            unitLabel: soldUnit?.name ?? null,
            unitQtyMilli: Math.round((l.qty * 1000) / factor),
          } as object),
          unitPaisa,
          linePaisa: unitPaisa * l.qty,
          discountPaisa: 0,
        } as unknown as Prisma.OrderLineCreateWithoutOrderInput;
      }

      /* ---- legacy path: a website product sold at the counter ---- */
      if (!l.productId) throw new BadRequestException('a line needs an itemId');
      const p = pMap.get(l.productId);
      if (!p) throw new BadRequestException(`productId ${l.productId} not found`);
      /*  DEC-PRD-028 — the counter honours the same price and the same window.  */
      const unitPaisa = l.unitPaisa ?? paidPaisa(p);
      return {
        product: { connect: { id: p.id } },
        name: p.name,
        addonLabels: [],
        productType: p.productType as ProductType,
        qty: l.qty,
        unitPaisa,
        linePaisa: unitPaisa * l.qty,
        discountPaisa: 0,
      };
    });

    // money (DEC-POS-015/016)
    const subtotalPaisa = lineData.reduce((s, l) => s + l.linePaisa, 0);
    const discountPaisa = Math.min(Math.max(0, dto.discountPaisa ?? 0), subtotalPaisa);
    const adjustmentPaisa = dto.adjustmentPaisa ?? 0;
    /*  DEC-GBL-002 (audit 11 Sep 2026 §3 #12) — ONE VAT RATE, AND IT IS
        FINANCE'S. `taxRateBps` used to be whatever the cashier picked from a
        four-value "demo set" hardcoded in the browser bundle, and the server
        stored it without a word — so a bill could carry a percentage the books
        had never heard of, while the POS settings screen said in so many words
        that the till does not get its own rate. The screen and the rule
        contradicted each other and the cashier won. `dto.taxRateBps` is now
        ignored; the rate comes from `PosSetting.defaultTaxRateBps`, which reads
        `FinanceSetting`.  */
    const taxRateBps = (await this.settings()).defaultTaxRateBps ?? 0;
    /*  audit §1 #5 — and it is REFUSED, not silently clamped. `Math.max(0, ...)`
        turned "take 5,000 off a 900 bill" into a 0 bill and said nothing; a
        number that big is a typo or a probe, and either way the cashier should
        hear about it.  */
    if (subtotalPaisa - discountPaisa + adjustmentPaisa < 0) {
      throw new BadRequestException('that takes the bill below zero — check the discount and the adjustment');
    }
    const base = Math.max(0, subtotalPaisa - discountPaisa + adjustmentPaisa);
    const vatPaisa = Math.round((base * taxRateBps) / 10000);
    const totalPaisa = base + vatPaisa;

    /*  ═══ THE DISCOUNT CAP, AND THE DOOR BESIDE IT — audit §1 #5 / #7, §3 #15
        ═══════════════════════════════════════════════════════════════════════
        Three separate holes, one gate:

        #5  A NEGATIVE ADJUSTMENT WAS UNCHECKED. The discount was clamped to the
            subtotal and cap-checked; `adjustmentPaisa` was neither, and it is
            signed — so a 100% giveaway was one keystroke away through the ±
            toggle, past a cap that had just refused the same money spelled as a
            discount. The owner has never said what a negative adjustment may
            reach, so the conservative reading applies (COMMON.md rule 4): money
            taken OFF the bill is money taken off the bill, whichever box it was
            typed into, and the whole of it is measured against the cap.
            → "Needs owner confirmation" in POS_A.md.

        #15 The cap itself was inert: no rule could ever be written against an
            item, so every counter cart capped at 100%. Fixed in the rules DTO.

        #7  The approval was a free string. It is now a server-issued one-shot
            token, burned inside the sale's transaction.  */
    const giveawayPaisa = discountPaisa + Math.max(0, -adjustmentPaisa);
    /*  a holder rather than a plain `let`: it is filled inside the sale's
        transaction, and a value written in a closure is not something the
        compiler can narrow afterwards  */
    const approval: { approvedById?: string; approvedByName?: string } = {};
    if (giveawayPaisa > 0) {
      const cap = await this.cartDiscountCap(
        dto.lines.map((l) => l.productId).filter((v): v is string => !!v),
        dto.lines.map((l) => l.itemId).filter((v): v is string => !!v),
      );
      const pct = subtotalPaisa ? (giveawayPaisa / subtotalPaisa) * 100 : 0;
      if (pct > cap + 0.001) {
        const token = dto.discountApprovalToken?.trim();
        if (!token) {
          throw new BadRequestException(
            `taking ${pct.toFixed(0)}% off this cart is over the ${cap}% cap — a manager has to approve it`,
          );
        }
        /*  checked here for a readable refusal, and claimed again inside the
            sale's transaction so two bills cannot spend one approval  */
        const held = await this.prisma.db.posDiscountApproval.findFirst({ where: { token } });
        if (!held || held.usedAt || held.expiresAt.getTime() < Date.now()) {
          throw new ForbiddenException('That approval is used, expired or not one this shop issued — ask a manager to approve again');
        }
      }
    }

    /*  ═══ THE BILL'S DISCOUNT, SPREAD ON TO THE LINES — audit §1 #6 ════════
        Every counter line was written `discountPaisa: 0` and the whole discount
        sat on the order. Returns then values a returned line at
        `(linePaisa − l.discountPaisa) / qty` — the FULL undiscounted price. On a
        multi-line bill, returning one line refunded more than the customer had
        paid for it, and the only brake (`paidPaisa − refundPaisa`) is one a
        multi-line bill does not reach.

        Pro-rata by line value, the remainder to the largest line, so
        `sum(line.discountPaisa) === order.discountPaisa` exactly — no paisa
        invented, none lost.

        VAT is deliberately NOT spread: checked first, and `OrderLine` has no VAT
        column anywhere in the schema — POS VAT lives only on the order
        (`vatPaisa`/`taxRateBps`). There is nothing per-line to allocate, so
        nothing here pretends there is.  */
    this.spreadDiscountOverLines(lineData, discountPaisa);

    // payments + due
    const payments = dto.payments ?? [];
    /* POS-REV-6 (30 Jul) — validate each tender instead of clamping it.
       It was `Math.max(0, p.amountPaisa)` in the sum and `if (p.amountPaisa <= 0)
       continue` in the write, so a negative or fractional tender was SILENTLY DROPPED:
       the receipt printed, the drawer total ignored it, and nobody was told a line had
       been thrown away. A till may refuse a bad number; it may never quietly discard it. */
    for (const p of payments) {
      if (!Number.isInteger(p.amountPaisa) || p.amountPaisa <= 0) {
        throw new BadRequestException(`${p.method} amount must be a positive whole number of paisa`);
      }
      if (!TENDER_METHOD[p.method]) throw new BadRequestException(`unknown tender: ${p.method}`);
      // DEC-GBL-001/006 — the shop's list decides, and it says WHICH account
      await this.payMethods.assertActive(p.method);
      p.accountId = (await this.payMethods.resolveAccount(p.method, p.accountId)) ?? undefined;
    }
    /*  ═══ GIVING CHANGE — audit 11 Sep 2026 §3 #11 ═════════════════════════
        Handing over a ৳1000 note for a ৳900 bill is the most ordinary thing
        that happens at a counter, and the till refused it outright: POS-REV-6
        was right that an overpayment must never be RECORDED as revenue (the
        drawer then closes short by exactly the change), but it fixed that by
        refusing the tender rather than by recording the right number. Meanwhile
        the sell panel printed "Change to give ৳100" beside the red error.

        So: the note may be typed as it was handed over. What is RECORDED is
        what the shop keeps — never more than the bill — and the difference
        comes back in the response as `changePaisa` so the till and the receipt
        can say what to hand back.

        Only CASH may overpay. A bKash or card tender is an exact transfer that
        actually happened; "change" out of one would be the shop paying cash
        against money it has not got, so those are still refused.  */
    /*  DEC-RTN-015 — store credit is not a tender and no money moves for it, so
        it comes off the bill BEFORE the tenders are measured: what the notes
        have to cover is the bill minus the credit.  */
    const creditAsked = Math.max(0, dto.storeCreditPaisa ?? 0);
    if (creditAsked > 0 && !(dto.customerId || dto.customerPhone?.trim()))
      throw new BadRequestException('Store credit belongs to a customer — say who this is');
    const payablePaisa = Math.max(0, totalPaisa - creditAsked);

    const tendered = payments.reduce((s, p) => s + p.amountPaisa, 0);
    const nonCashPaisa = payments.filter((p) => p.method !== 'cash').reduce((s, p) => s + p.amountPaisa, 0);
    let changePaisa = 0;
    if (tendered > payablePaisa) {
      if (nonCashPaisa > payablePaisa) {
        throw new BadRequestException(
          `a ${(nonCashPaisa / 100).toFixed(2)} transfer is more than the ${(payablePaisa / 100).toFixed(2)} still to pay — no change can be given out of a non-cash payment`,
        );
      }
      changePaisa = tendered - payablePaisa;
      /*  trim the cash tenders down to what is kept, biggest note first, so
          the recorded payments add up to the bill exactly  */
      let left = changePaisa;
      for (const p of [...payments].filter((x) => x.method === 'cash').sort((a, b) => b.amountPaisa - a.amountPaisa)) {
        if (left <= 0) break;
        const cut = Math.min(left, p.amountPaisa);
        p.amountPaisa -= cut;
        left -= cut;
      }
      // a fully-consumed cash line is not a payment; drop it rather than write a zero
      for (let i = payments.length - 1; i >= 0; i--) if (payments[i].amountPaisa === 0) payments.splice(i, 1);
    }
    const paid = payments.reduce((s, p) => s + p.amountPaisa, 0);
    /*  Returns owns the credit ledger and checks the balance and the shop's cap;
        the amount is applied after the order exists, so the CONSUMED row can
        name the bill it paid for.  */
    if (creditAsked > 0 && paid + creditAsked > totalPaisa)
      throw new BadRequestException(
        `${(creditAsked / 100).toFixed(2)} of credit plus ${(paid / 100).toFixed(2)} tendered is more than the ${(totalPaisa / 100).toFixed(2)} bill`,
      );

    const duePaisa = Math.max(0, totalPaisa - paid - creditAsked);

    /*  DEC-POS-022 — an advance order is a promise, not a hand-over. The goods
        stay on the shelf until the day comes, so nothing about stock happens
        here; the money that came in today is real and is recorded.  */
    const promisedFor = dto.advance?.promisedFor ? new Date(dto.advance.promisedFor) : null;
    if (promisedFor && Number.isNaN(promisedFor.getTime()))
      throw new BadRequestException('That pick-up date cannot be read');
    if (promisedFor && promisedFor.getTime() < Date.now() - 24 * 60 * 60 * 1000)
      throw new BadRequestException('An advance order cannot be promised for a day that has passed');
    const isAdvance = !!promisedFor;

    // payment-mode rules (DEC-POS-017 / DEC-POS-008)
    if (!isAdvance && dto.payMode === 'full' && duePaisa > 0) throw new BadRequestException('full payment: take the whole amount or switch to partial');
    const identified = !!(dto.customerId || dto.customerPhone?.trim());
    if (duePaisa > 0 && !identified) throw new BadRequestException('a due (credit) sale needs an identified customer');

    const customer = await this.resolveCustomer(dto);
    /*  DEC-POS-019 — the cashier says which channel this sale came through; the
        counter's own channel is the default when nothing is picked.  */
    /*  DEC-POS-020 — a bill may be dated back, never forward. "Forward" has to
        allow for the clock: the shop is at UTC+6 and the server is not, so a
        bill written this morning arrives stamped a few hours ahead. Anything
        inside a day is pulled back to now; a genuinely later day is refused.  */
    const asked = dto.saleDate ? new Date(dto.saleDate) : new Date();
    if (Number.isNaN(asked.getTime())) throw new BadRequestException('That date cannot be read');
    const now = Date.now();
    if (asked.getTime() > now + 24 * 60 * 60 * 1000)
      throw new BadRequestException('A bill cannot be dated in the future');
    const saleDate = asked.getTime() > now ? new Date(now) : asked;

    const channelId = dto.channelId
      ? (await this.prisma.db.channel.findFirst({ where: { id: dto.channelId, isActive: true }, select: { id: true } }))?.id
        ?? (() => { throw new BadRequestException('That sales channel is switched off'); })()
      : await this.posChannelId();
    const paymentStatus = duePaisa === 0 ? PaymentStatus.paid : paid > 0 ? PaymentStatus.advance_paid : PaymentStatus.unpaid;

    /*  audit 11 Sep 2026 §3 #22 — the BRANCH field gets a branch, not a counter.
        `branchId: dto.branchId ?? shift.registerId` wrote a register id into the
        order's branch column. Both are soft refs (`String?`), so nothing ever
        errored — the data was simply wrong, and anything that later grouped by
        branch was grouping by till.  */
    const register = shift.registerId
      ? await this.prisma.db.posRegister.findFirst({ where: { id: shift.registerId }, select: { branchId: true } })
      : null;

    // POS-REV-2 — receipt number allocated INSIDE the retry, wrapping the whole sale
    const order = await this.withNextNo(
      (skip) => this.nextPosNo(skip),
      (orderNo) => this.prisma.db.$transaction(async (tx) => {
      /*  ═══ THE BOX IS STILL OPEN — audit 11 Sep 2026 §1 #9 ══════════════════
          The shift was read before the transaction and the cash movement written
          inside it. If day-close ran on another terminal in between, the notes
          landed on a shift whose `expectedCashPaisa` had already been
          snapshotted — money counted in no drawer at all, for ever. So the
          status is re-asserted HERE, as a one-winner claim, and the sale fails
          if the box closed underneath it. The till simply opens a new box on
          the retry, which is what `openDrawerIfNeeded` is for.  */
      const boxOpen = await tx.posShift.updateMany({
        where: { id: shift.id, status: PosShiftStatus.OPEN },
        data: { cashierName: shift.cashierName },
      });
      if (boxOpen.count !== 1) {
        throw new BadRequestException('the cash box was closed while this sale was being rung up — ring it up again and it will open a new one');
      }

      /*  ═══ AND IT IS STILL ON THE SHELF — audit §1 #2 ═══════════════════════
          Binding this time: the rows are locked and re-counted inside the
          transaction, so two tills cannot both sell the last stem. A shortage
          here rolls the whole sale back rather than printing a bill for goods
          the shop has not got.  */
      if (!isAdvance && trackedItems.length) {
        await this.assertStock(tx as unknown as Prisma.TransactionClient, trackedItems, wantedMilli, true);
      }

      const created = await tx.order.create({
        data: {
          orderNo,
          /*  DEC-POS-020 — the bill's own date. A counter sale is normally now,
              but a bill written up the next morning must be able to say which
              day it belongs to. The future is refused above; the drawer and the
              shift stay with today either way.  */
          placedAt: saleDate,
          ...({ salespersonName: dto.salespersonName?.trim() || actorName } as object),
          channel: { connect: { id: channelId } },
          customer: { connect: { id: customer.id } },
          senderName: customer.name,
          senderPhone: customer.phone ?? '',
          fulfillmentType: FulfillmentType.COUNTER,
          promisedBy: promisedFor,
          branchId: dto.branchId ?? register?.branchId ?? null,
          posShift: { connect: { id: shift.id } },
          isGift: dto.isGift ?? false,
          /*  DEC-POS-022 — a walk-in is settled the moment it is rung up; an
              advance order is only placed, and completes when it is handed over.  */
          salesStatus: isAdvance ? SalesStatus.placed : SalesStatus.completed,
          deliveryStatus: isAdvance ? DeliveryStatus.unassigned : DeliveryStatus.delivered,
          zone: DeliveryZone.COUNTER,
          address: 'Counter sale',
          paymentMethod: PaymentMethod.counter,
          paymentStatus,
          /*  DEC-RTN-015 — credit counts as settled on the ORDER, even though no
              money moved. Every other place asks "total − paid − refunded" to
              decide what is still owed (the due board, collectDue, the advance
              list); leaving credit out of `paidPaisa` would make all of them
              chase money the customer does not owe. What actually came in is
              still readable, line by line, from the payment rows.  */
          paidPaisa: paid + creditAsked,
          duePaisa,
          subtotalPaisa,
          discountPaisa,
          adjustmentPaisa,
          vatPaisa,
          taxRateBps,
          totalPaisa,
          /*  the charge names (DEC-POS-015) and the cashier's own words about
              this sale (DEC-POS-020) both belong on the bill  */
          internalNote: [dto.note?.trim(), dto.adjustmentNote?.trim()].filter(Boolean).join(" · ") || null,
          /*  audit §1 #1 — the key the unique index judges. A second click
              carrying the same key fails HERE, at INSERT, and is turned into
              the original bill by the caller.  */
          ...({ posIdempotencyKey: idemKey, posChangePaisa: changePaisa } as object),
          lines: { create: lineData },
        },
        include: { lines: true },
      });

      /*  audit §1 #7 — burn the manager's approval against THIS bill, and write
          down who gave it. One approval, one sale: the claim is a guarded
          updateMany, so a double-click cannot spend it twice either.  */
      if (dto.discountApprovalToken?.trim()) {
        const ok = await this.burnApproval(tx as unknown as Prisma.TransactionClient, dto.discountApprovalToken.trim(), created.id);
        approval.approvedById = ok.approvedById;
        approval.approvedByName = ok.approvedByName;
        await tx.order.update({
          where: { id: created.id },
          data: {
            ...({
              discountApprovedBy: ok.approvedByName,
              discountApprovedById: ok.approvedById,
            } as object),
          },
        });
      }

      // payment transactions (split) — DEC-POS-009. Every tender is already validated
      // above (POS-REV-6), so there is nothing left here to skip over silently.
      for (const p of payments) {
        await tx.paymentTransaction.create({
          data: {
            orderId: created.id,
            kind: PaymentTxnKind.PAYMENT,
            method: TENDER_METHOD[p.method],
            amountPaisa: p.amountPaisa,
            actorName,
            ...({ accountId: p.accountId ?? null } as object), // DEC-GBL-006
          },
        });
      }

      // cash into the drawer for this shift (DEC-POS-010)
      const cashPaid = payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amountPaisa, 0);
      if (cashPaid > 0) {
        await tx.posCashMovement.create({ data: { shiftId: shift.id, kind: PosCashKind.SALE_CASH, amountPaisa: cashPaid, note: orderNo, actorName } });
      }

      /*  legacy Product.stockQty decrement (DEC-INV-015 stage 1 — still the enforcing
          copy) — only for the legacy product lines. An item line's stock leaves
          through Inventory alone (DEC-POS-018), which is the whole point.  */
      if (!isAdvance) {
        for (const l of dto.lines) {
          if (!l.productId) continue;
          const p = pMap.get(l.productId);
          if (p && p.stockMode === 'MANUAL') {
            /*  audit §1 #2 — GUARDED, and it cannot go below zero. This was a
                bare `decrement`, so two tills selling the last one both wrote
                and the shelf went negative in silence. `count !== 1` means
                somebody got there first: the whole sale rolls back.  */
            const taken = await tx.product.updateMany({
              where: { id: p.id, stockQty: { gte: l.qty } },
              data: { stockQty: { decrement: l.qty } },
            });
            if (taken.count !== 1) {
              throw new BadRequestException(`not enough stock: ${p.name} — somebody sold the last of it just now`);
            }
          }
        }
      }

      // customer sales mirror (Sales owns this; POS completes the sale)
      await tx.customer.update({
        where: { id: customer.id },
        data: { ordersCount: { increment: 1 }, ltvPaisa: { increment: BigInt(totalPaisa) }, lastOrderAt: new Date() },
      });

      return created;
      }),
    ).catch(async (e) => {
      /*  audit §1 #1 — two clicks arrived together, both read "no such key", and
          the database caught the loser at INSERT. That is the guarantee working:
          hand back the bill the winner made, not a second one.  */
      const dup =
        idemKey &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        JSON.stringify(e.meta ?? {}).includes('osIdempotencyKey');
      if (dup) {
        /*  the winner may still be committing — wait for it rather than handing
            the cashier a 500 for having clicked twice  */
        for (let look = 0; look < 5; look++) {
          const original = await this.findByIdempotencyKey(idemKey);
          if (original) return original;
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      throw e;
    });
    /*  the duplicate path above hands back the finished bill, which is already
        the shape this method promises — nothing below has to run a second time  */
    if ('transactions' in order) return { ...order, changePaisa: order.posChangePaisa ?? 0 };
    const orderNo = order.orderNo;

    await this.audit.record({ entityType: ENTITY, entityId: order.id, action: 'CREATE', actorName });

    /*  DEC-RTN-015 — now the bill exists, spend the credit against it. Returns
        writes the CONSUMED row and hands it to Finance; if it refuses (the
        balance moved between the screen and the save), the sale stands and the
        refusal is on the order's timeline rather than swallowed.  */
    if (creditAsked > 0) {
      try {
        await this.returns.spendCredit({
          customerId: customer.id,
          amountPaisa: creditAsked,
          billTotalPaisa: totalPaisa,
          orderId: order.id,
          actorName,
        });
        await this.audit.event({
          entityType: 'Order', entityId: order.id, kind: 'payment',
          label: `Store credit used: ${(creditAsked / 100).toFixed(2)}`,
          actorName,
        });
      } catch (e) {
        await this.audit.event({
          entityType: 'Order', entityId: order.id, kind: 'system',
          label: `⚠ Store credit of ${(creditAsked / 100).toFixed(2)} could NOT be applied — the bill shows it settled but the credit was not taken. Collect it or fix the credit ledger.`,
          actorName,
          note: e instanceof Error ? e.message : String(e),
        });
      }
    }

    /*  DEC-POS-027 — a due that puts the customer over the shop's ceiling is
        allowed, and said out loud. On the record too, so "who let this run up"
        has an answer later.  */
    if (duePaisa > 0) {
      const credit = await this.creditStanding(customer.id);
      if (credit.over) {
        await this.audit.event({
          entityType: 'Order',
          entityId: order.id,
          kind: 'sales',
          label: `⚠ ${customer.name} now owes ${(credit.outstandingPaisa / 100).toFixed(2)} — over the ${(credit.limitPaisa / 100).toFixed(2)} credit limit`,
          actorName,
        });
      }
    }
    await this.audit.event({ entityType: 'Order', entityId: order.id, kind: 'sales', label: `POS sale ${orderNo} · ${customer.name}`, actorName });

    /*  audit §1 #7 — the approver is on the order AND on the timeline. "Who let
        this discount through" used to have no answer anywhere at all.  */
    if (approval.approvedByName) {
      await this.audit.event({
        entityType: 'Order', entityId: order.id, kind: 'sales', actorName,
        label: `Over-cap discount on ${orderNo} approved by ${approval.approvedByName}`,
      });
    }

    /*  ═══ THE STOCK LEAVES, OR THE BILL DOES NOT STAND — audit §1 #2 ═══════
        This was fail-soft: if `postSaleForOrder` threw, the sale still
        completed and the only trace was one audit line. The bill existed, the
        money was booked, and the shelf never moved — the single worst kind of
        silence in this module, because every later count is then wrong and
        nothing says why.

        Inventory runs on its own connection and `postSaleForOrder` takes no
        `tx` (see `assertStock` above), so it cannot be rolled back with the
        sale. What it gets instead is a COMPENSATION: the bill is voided —
        tenders reversed, drawer put back, customer mirror undone, order
        cancelled — and the cashier is told, instead of handing over goods the
        books think are still on the shelf.  */
    if (!isAdvance) {
      try {
        const r = await this.inventory.postSaleForOrder({ orderId: order.id, orderNo, actor: actorName, direction: -1, lines: dto.lines.map((l) => ({ productId: l.productId ?? null, itemId: l.itemId ?? null, qty: l.qty, qtyMilliOverride: l.itemId ? Math.round((l.qty * 1000) / lineUnitFactor(l)) : undefined })) });
        if (r.skipped.length) {
          await this.audit.event({ entityType: 'Order', entityId: order.id, kind: 'system', label: `Inventory: ${r.posted} movement(s); skipped (no item link): ${r.skipped.join(', ')}`, actorName });
        }
      } catch (e) {
        const why = e instanceof Error ? e.message : 'error';
        await this.audit.event({
          entityType: 'Order', entityId: order.id, kind: 'system',
          actorName,
          label: `⚠ Stock did NOT leave for ${orderNo} (${why}) — the bill is being reversed. If Inventory posted part of it, check the movements for this order by hand.`,
        });
        await this.unwindSale(order.id, `stock could not be deducted: ${why}`, actorName).catch(() => undefined);
        throw new BadRequestException(
          `This sale was reversed: the stock could not be taken off the shelf (${why}). Nothing has been charged — try again.`,
        );
      }
    }

    // books: revenue + VAT + cost of goods, then each tender that came in.
    // POS-REV-5 — awaited and flagged. This is the cash register: a sale that never
    // posts takes its revenue, its VAT and its cost of goods with it, and the day
    // still looks like it balanced.
    /*  DEC-POS-022 — no goods have moved, so there is no revenue and no cost of
        goods yet; only the money that came in is booked below.  */
    if (!isAdvance) await this.book(order.id, `POS sale ${orderNo}`, () => this.financeEvents.onPosSale(order.id), actorName);
    const tenders = await this.prisma.db.paymentTransaction.findMany({ where: { orderId: order.id } });
    for (const t of tenders) {
      await this.book(order.id, `${t.method} tender on ${orderNo}`, () => this.financeEvents.onPaymentRecorded(t.id), actorName);
    }

    const saved = await this.prisma.db.order.findFirst({ where: { id: order.id }, include: { lines: true, transactions: true, customer: { select: { id: true, name: true, phone: true } } } });
    /*  audit §3 #11 — what to hand back over the counter. The payments recorded
        are what the shop KEEPS; this is the difference the cashier gives.  */
    return saved ? { ...saved, changePaisa } : saved;
  }

  /* ------------------------------------------------ void (audit §3 #21) */

  /**
   * ═══ UNDO A COUNTER BILL, IN ONE TRANSACTION ══════════════════════════════
   *
   * Two callers: `POST /pos/sales/:id/void` (the cashier mis-rang it) and
   * `createSale` itself, when Inventory refuses to move the stock and the bill
   * must not be left standing.
   *
   * What it reverses, all of it POS-owned:
   *   · the order            — cancelled, with the reason on it
   *   · the tenders          — a REFUND row per payment, and `refundPaisa` set,
   *                            so Returns cannot later refund the same money
   *   · the drawer           — a cash bill takes the notes back out of the box
   *   · the customer mirror  — the order count and the lifetime value it added
   * and then, outside the transaction, the stock goes back on the shelf through
   * Inventory (`postSaleForOrder` with direction +1 — the same way
   * orders.service reverts a stock-out).
   *
   * ⚠️ WHAT IT DOES NOT DO, and why: it does not touch the LEDGER. Finance
   * consumes completed business events and POS never writes journal entries
   * (module constitution). There is no `onPosSaleVoided` event to raise — so the
   * reversal lands on the order's timeline as a ⚠ line for a human, and the
   * missing event is written up in POS_A.md for whoever owns
   * finance-events.service.ts.
   */
  private async unwindSale(orderId: string, reason: string, actorName: string) {
    const order = await this.prisma.db.order.findFirst({
      where: { id: orderId, fulfillmentType: FulfillmentType.COUNTER },
      include: {
        transactions: { where: { deletedAt: null } },
        lines: { select: { productId: true, qty: true, ...({ itemId: true, unitQtyMilli: true } as object) } },
      },
    });
    if (!order) throw new NotFoundException('counter bill not found');

    const wasAdvance = order.salesStatus === SalesStatus.placed;
    const drawer = await this.currentShift();

    const { cashBack, refundPaisa } = await this.prisma.db.$transaction(async (tx) => {
      /*  one winner: two clicks on Void cannot both reverse the money  */
      const claimed = await tx.order.updateMany({
        where: { id: order.id, salesStatus: { not: SalesStatus.cancelled } },
        data: {
          salesStatus: SalesStatus.cancelled,
          cancelledAt: new Date(),
          deliveryStatus: DeliveryStatus.stock_reverted,
          failReason: reason,
        },
      });
      if (claimed.count !== 1) throw new BadRequestException('this bill has already been voided');

      const taken = order.transactions.filter((t) => t.kind !== PaymentTxnKind.REFUND);
      let back = 0;
      let cash = 0;
      for (const t of taken) {
        await tx.paymentTransaction.create({
          data: {
            orderId: order.id,
            kind: PaymentTxnKind.REFUND,
            method: t.method,
            amountPaisa: t.amountPaisa,
            actorName,
            ...({ accountId: (t as { accountId?: string | null }).accountId ?? null } as object),
          },
        });
        back += t.amountPaisa;
        if (t.method === PaymentMethod.cash) cash += t.amountPaisa;
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          refundPaisa: { increment: back },
          duePaisa: 0,
          paymentStatus: back > 0 ? PaymentStatus.refunded : PaymentStatus.unpaid,
          internalNote: [order.internalNote, `VOID: ${reason}`].filter(Boolean).join(' · '),
        },
      });

      /*  the notes physically go back over the counter, so the box has to say
          so — otherwise the count at close is over by exactly the refund  */
      if (cash > 0 && drawer) {
        await tx.posCashMovement.create({
          data: {
            shiftId: drawer.id,
            kind: PosCashKind.PAYOUT,
            amountPaisa: -cash,
            note: `${order.orderNo} voided`,
            actorName,
          },
        });
      }

      // the customer never bought this; undo what the sale added
      await tx.customer.update({
        where: { id: order.customerId },
        data: { ordersCount: { decrement: 1 }, ltvPaisa: { decrement: BigInt(order.totalPaisa) } },
      });

      return { cashBack: cash, refundPaisa: back };
    });

    /*  the stock goes back — only if it ever left. An advance order that was
        never handed over never took anything off the shelf.  */
    if (!wasAdvance && order.lines.length) {
      try {
        await this.inventory.postSaleForOrder({
          orderId: order.id,
          orderNo: `${order.orderNo} · void`,
          actor: actorName,
          direction: 1,
          lines: order.lines.map((l) => ({
            productId: l.productId ?? null,
            itemId: (l as { itemId?: string | null }).itemId ?? null,
            qty: l.qty,
            qtyMilliOverride: (l as { unitQtyMilli?: number | null }).unitQtyMilli ?? undefined,
          })),
        });
      } catch (e) {
        await this.audit.event({
          entityType: 'Order', entityId: order.id, kind: 'system', actorName,
          label: `⚠ ${order.orderNo} was voided but the stock did NOT go back on the shelf — put it back by hand (${e instanceof Error ? e.message : 'error'})`,
        });
      }
      // the legacy copy, for the website-product lines (DEC-INV-015 stage 1)
      for (const l of order.lines) {
        if (!l.productId) continue;
        await this.prisma.db.product
          .updateMany({ where: { id: l.productId, stockMode: 'MANUAL' }, data: { stockQty: { increment: l.qty } } })
          .catch(() => undefined);
      }
    }

    await this.audit.record({ entityType: ENTITY, entityId: order.id, action: 'UPDATE', actorName, changes: { voided: true, reason, refundPaisa } });
    await this.audit.event({
      entityType: 'Order', entityId: order.id, kind: 'sales', actorName,
      label: `${order.orderNo} voided — ${reason}${refundPaisa ? ` · ${(refundPaisa / 100).toFixed(2)} given back${cashBack ? ` (${(cashBack / 100).toFixed(2)} cash)` : ''}` : ''}`,
    });
    /*  Finance has no "counter bill voided" event to consume (see the note on
        this method) — say so where somebody will read it  */
    if (!wasAdvance) {
      await this.audit.event({
        entityType: 'Order', entityId: order.id, kind: 'system', actorName,
        label: `⚠ ${order.orderNo} is reversed in POS but NOT in the ledger — the revenue, VAT and cost of goods it posted need a correcting entry in Finance.`,
      });
    }
    return this.prisma.db.order.findFirst({
      where: { id: order.id },
      include: { lines: true, transactions: true, customer: { select: { id: true, name: true, phone: true } } },
    });
  }

  /**
   * The cashier's own undo: the bill of five minutes ago, taken back.
   *
   * Until now there was no void, no counter refund and no correction anywhere in
   * POS. A mis-rung bill could only be unwound through the Returns workflow
   * (create → approve → complete), which needs `deliveryStatus = delivered` —
   * true for a walk-in, FALSE for an advance order, which therefore could not be
   * undone at all. An abandoned advance sat on the board with its due for ever.
   *
   * Two guards, both conservative: the bill must belong to the cash box that is
   * open NOW (a closed box has been counted and its over/short posted — changing
   * it afterwards rewrites a day somebody signed off), and a bill Returns has
   * already touched is Returns' business, not the till's.
   */
  async voidSale(orderId: string, dto: VoidPosSaleDto) {
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('Say why this bill is being voided');
    const actorName = dto.actorName ?? 'Cashier';

    const order = await this.prisma.db.order.findFirst({
      where: { id: orderId, fulfillmentType: FulfillmentType.COUNTER },
      select: { id: true, orderNo: true, salesStatus: true, posShiftId: true, refundPaisa: true },
    });
    if (!order) throw new NotFoundException('counter bill not found');
    if (order.salesStatus === SalesStatus.cancelled) throw new BadRequestException('this bill has already been voided');

    const returned = await this.prisma.db.salesReturn.count({ where: { orderId: order.id } });
    if (returned > 0 || order.refundPaisa > 0) {
      throw new BadRequestException('this bill has already been refunded — finish it in Returns, not at the till');
    }

    const drawer = await this.currentShift();
    if (!drawer) {
      throw new BadRequestException('the cash box is closed — a bill from a closed day is unwound in Returns, not voided at the till');
    }
    if (order.posShiftId && order.posShiftId !== drawer.id) {
      throw new BadRequestException(
        `${order.orderNo} belongs to a cash box that has already been counted and closed — unwind it in Returns`,
      );
    }

    return this.unwindSale(order.id, reason, actorName);
  }

  /* ------------------------------------------------ receipt (audit §4 / §5 #1) */

  /**
   * Everything a printed slip needs, resolved HERE.
   *
   * `receiptHeader`, `receiptFooter` and `giftReceiptHidePrice` have been stored
   * and editable in POS settings since the module was built and NOTHING read any
   * of them — not the sell screen, not the bill page, not the Reprint modal,
   * which showed a summary with no line items, no VAT and no discount and then
   * called `window.print()` on the whole admin page.
   *
   * Resolved on the server on purpose: a receipt assembled in the browser out of
   * whatever the screen happens to be holding can disagree with the books, and
   * the piece of paper the customer walks out with is the one document that must
   * not.
   */
  async receipt(orderId: string) {
    const o = await this.prisma.db.order.findFirst({
      where: { id: orderId, fulfillmentType: FulfillmentType.COUNTER },
      include: {
        lines: true,
        transactions: { where: { deletedAt: null } },
        customer: { select: { name: true, phone: true } },
        posShift: { select: { cashierName: true, register: { select: { name: true } } } },
      },
    });
    if (!o) throw new NotFoundException('counter bill not found');

    const s = await this.settings();
    const company = await this.prisma.db.companySetting.findFirst({
      select: {
        tradeName: true, legalName: true, operatingAddress: true, registeredAddress: true,
        city: true, publicPhone: true,
      },
    });

    const payments = o.transactions
      .filter((t) => t.kind !== PaymentTxnKind.REFUND)
      .map((t) => ({ method: String(t.method), amountPaisa: t.amountPaisa }));
    const refundedPaisa = o.transactions
      .filter((t) => t.kind === PaymentTxnKind.REFUND)
      .reduce((n, t) => n + t.amountPaisa, 0);
    const tenderedPaisa = payments.reduce((n, p) => n + p.amountPaisa, 0);

    const address =
      [company?.operatingAddress ?? company?.registeredAddress ?? null, company?.city]
        .filter(Boolean)
        .join(', ') || null;

    return {
      orderNo: o.orderNo,
      placedAt: o.placedAt.toISOString(),
      cashierName: (o as { salespersonName?: string | null }).salespersonName ?? o.posShift?.cashierName ?? null,
      registerName: o.posShift?.register?.name ?? null,
      shop: {
        name: company?.tradeName ?? company?.legalName ?? 'Radian',
        address,
        phone: company?.publicPhone ?? null,
        receiptHeader: s.receiptHeader ?? null,
        receiptFooter: s.receiptFooter ?? null,
        /*  a gift slip prints with no prices, which for a flower shop is the
            common case rather than the exception. The FLAG is what is reported;
            the prices are still sent, because the same payload feeds the shop's
            own copy — the print view decides what it draws.  */
        giftReceiptHidePrice: !!s.giftReceiptHidePrice && !!o.isGift,
      },
      isGift: o.isGift,
      customer:
        o.customer && o.customer.phone !== 'WALK-IN'
          ? { name: o.customer.name, phone: o.customer.phone }
          : null,
      lines: o.lines.map((l) => ({
        name: l.name,
        qty: l.qty,
        // DEC-POS-024 — the unit this line was SOLD in, snapshotted at sale time
        unitLabel: (l as { unitLabel?: string | null }).unitLabel ?? null,
        unitPaisa: l.unitPaisa,
        linePaisa: l.linePaisa,
        discountPaisa: l.discountPaisa,
      })),
      subtotalPaisa: o.subtotalPaisa,
      discountPaisa: o.discountPaisa,
      adjustmentPaisa: o.adjustmentPaisa,
      vatPaisa: o.vatPaisa,
      taxRateBps: o.taxRateBps,
      totalPaisa: o.totalPaisa,
      payments,
      paidPaisa: o.paidPaisa,
      /*  audit §3 #11 — what was handed back, as it was on the day  */
      changePaisa: (o as { posChangePaisa?: number | null }).posChangePaisa ?? 0,
      duePaisa: o.duePaisa,
      refundedPaisa,
      /*  DEC-RTN-015 — store credit counts inside `paidPaisa` but is not a
          tender, so the slip can name it: paid minus what the tenders came to  */
      storeCreditPaisa: Math.max(0, o.paidPaisa - tenderedPaisa),
      note: o.internalNote ?? null,
      voided: o.salesStatus === SalesStatus.cancelled,
    };
  }

  /* ------------------------------------------------ sales list / due / collect */

  async listSales(q: { search?: string; days?: number }) {
    const where: Prisma.OrderWhereInput = { fulfillmentType: FulfillmentType.COUNTER };
    if (q.days) where.placedAt = { gte: new Date(Date.now() - q.days * 86400000) };
    if (q.search) where.OR = [
      { orderNo: { contains: q.search, mode: 'insensitive' } },
      { senderName: { contains: q.search, mode: 'insensitive' } },
      { senderPhone: { contains: q.search } },
    ];
    return this.prisma.db.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      take: 200,
      include: { customer: { select: { id: true, name: true, phone: true } }, transactions: { where: { deletedAt: null } }, _count: { select: { lines: true } } },
    });
  }

  /**
   * DEC-POS-027 (owner, 31 Aug 2026) — the counter's credit ceiling **warns,
   * it never blocks**.
   *
   * `PosSetting.defaultCreditLimitPaisa` was a field the settings screen could
   * write and **nothing in the system ever read**, so counter credit was
   * unlimited: one customer could keep taking goods on due for ever and no
   * screen ever said a word. Asked on 31 Aug, the owner's answer was a limit
   * that speaks rather than one that refuses — the person at the counter knows
   * things the ledger does not, and a till that stops a sale in front of a
   * regular customer costs more than the risk.
   *
   * 0 = no ceiling at all, which is also a legitimate answer.
   */
  async creditStanding(customerId: string) {
    const s = await this.settings();
    const limitPaisa = s.defaultCreditLimitPaisa ?? 0;
    const rows = await this.prisma.db.order.findMany({
      where: { customerId, fulfillmentType: FulfillmentType.COUNTER, duePaisa: { gt: 0 } },
      select: { duePaisa: true },
    });
    const outstandingPaisa = rows.reduce((n, o) => n + o.duePaisa, 0);
    return {
      customerId,
      limitPaisa,
      outstandingPaisa,
      billsOpen: rows.length,
      over: limitPaisa > 0 && outstandingPaisa > limitPaisa,
    };
  }

  async dueBoard() {
    const orders = await this.prisma.db.order.findMany({
      where: { fulfillmentType: FulfillmentType.COUNTER, duePaisa: { gt: 0 } },
      orderBy: { placedAt: 'asc' },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });
    const byCustomer = new Map<string, { customerId: string; name: string; phone: string | null; duePaisa: number; oldest: Date; orders: { id: string; orderNo: string; duePaisa: number; placedAt: Date }[] }>();
    for (const o of orders) {
      const key = o.customerId;
      const row = byCustomer.get(key) ?? { customerId: key, name: o.customer.name, phone: o.customer.phone, duePaisa: 0, oldest: o.placedAt, orders: [] };
      row.duePaisa += o.duePaisa;
      row.orders.push({ id: o.id, orderNo: o.orderNo, duePaisa: o.duePaisa, placedAt: o.placedAt });
      if (o.placedAt < row.oldest) row.oldest = o.placedAt;
      byCustomer.set(key, row);
    }
    return Array.from(byCustomer.values()).sort((a, b) => b.duePaisa - a.duePaisa);
  }

  /**
   * Collect against a credit sale.
   *
   * POS-REV-3 (30 Jul) — this was a LOST UPDATE, and it lost money in the direction
   * that hurts. It read the order, then wrote `paidPaisa` as an ABSOLUTE figure
   * (`o.paidPaisa + amount`). Two cashiers collecting from the same customer at the
   * same moment both read paidPaisa = 0, both created a PaymentTransaction, and both
   * wrote paidPaisa = their own amount. So: two payments in the ledger, ONE of them on
   * the order — the customer is still shown as owing money he has already paid, and
   * the ledger and the order disagree for ever with no way to tell which is right.
   * `increment` is the only safe verb here, and the whole thing belongs in one
   * transaction with the tender rows it is counting.
   *
   * POS-REV-4 (30 Jul) — and the cash went into the WRONG DRAWER, or into none at all.
   * It credited `o.posShiftId` — the shift the ORIGINAL sale was rung up on, often
   * weeks ago. Guarded by `status === OPEN`, so in the normal case (that shift is long
   * closed) the branch simply did nothing: the customer handed over real notes and
   * NOTHING recorded them. At close, today's drawer is over by that amount, the
   * cashier cannot explain it, and over/short exists precisely so that unexplained
   * money is a question. Cash belongs to the drawer it physically entered — the shift
   * open NOW.
   */
  /* ------------------------------------------------ advance orders (DEC-POS-022) */

  /** what is promised and not yet handed over, soonest first */
  async advanceOrders() {
    const rows = await this.prisma.db.order.findMany({
      where: {
        fulfillmentType: FulfillmentType.COUNTER,
        salesStatus: SalesStatus.placed,
        promisedBy: { not: null },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        lines: { select: { id: true, name: true, qty: true, unitPaisa: true } },
      },
      orderBy: { promisedBy: 'asc' },
    });
    return rows.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      placedAt: o.placedAt.toISOString(),
      promisedBy: o.promisedBy ? o.promisedBy.toISOString() : null,
      customerName: o.customer?.name ?? o.senderName,
      customerPhone: o.customer?.phone ?? o.senderPhone,
      totalPaisa: o.totalPaisa,
      paidPaisa: o.paidPaisa,
      duePaisa: Math.max(0, o.totalPaisa - (o.paidPaisa - o.refundPaisa)),
      lines: o.lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, unitPaisa: l.unitPaisa })),
    }));
  }

  /**
   * The day came: the goods leave now, the rest of the money is taken now, and
   * only now does the sale become revenue. Everything the walk-in path does at
   * the counter, an advance order does here instead (DEC-POS-022).
   */
  async handOverAdvance(orderId: string, dto: { payments?: PosPaymentDto[]; actorName?: string }) {
    const actorName = dto.actorName ?? 'Cashier';
    const o = await this.prisma.db.order.findFirst({
      where: { id: orderId, fulfillmentType: FulfillmentType.COUNTER },
      include: { lines: { select: { productId: true, qty: true, ...({ itemId: true, unitQtyMilli: true } as object) } } },
    });
    if (!o) throw new NotFoundException('advance order not found');
    if (o.salesStatus !== SalesStatus.placed) throw new BadRequestException('this order has already been handed over');

    /*  ═══ IS IT STILL ON THE SHELF — audit 11 Sep 2026 §3 #24 ═══════════════
        The goods were promised weeks ago and deliberately NOT reserved
        (DEC-POS-022). If they sold out meanwhile, the hand-over used to go
        straight through and Inventory was then asked to take stock that is not
        there — fail-soft, so it landed as an audit line nobody reads and the
        shelf went negative. The walk-in path checks; so does this one now.  */
    const itemIds = o.lines
      .map((l) => (l as { itemId?: string | null }).itemId)
      .filter((v): v is string => !!v);
    const trackedItems = itemIds.length
      ? (
          await this.prisma.db.item.findMany({
            where: { id: { in: itemIds }, isStockTracked: true },
            select: { id: true, name: true, unit: { select: { name: true } } },
          })
        ).map((i) => ({ id: i.id, name: i.name, unitName: i.unit?.name ?? '' }))
      : [];
    const wantedMilli = new Map<string, number>();
    for (const l of o.lines) {
      const itemId = (l as { itemId?: string | null }).itemId;
      if (!itemId) continue;
      // DEC-POS-024 — the snapshot decides how much stock leaves, not the qty
      const milli = (l as { unitQtyMilli?: number | null }).unitQtyMilli ?? l.qty * 1000;
      wantedMilli.set(itemId, (wantedMilli.get(itemId) ?? 0) + milli);
    }

    /*  ═══ ONE HAND-OVER — audit 11 Sep 2026 §1 #4 ═══════════════════════════
        This was check-then-update across three un-transacted writes: the status
        was read, the money was collected, and only THEN was the status flipped.
        Two clicks handed the same order over twice and the stock left twice
        (Finance was safe only because `JournalEntry.sourceKey` is @unique). And
        if the status write failed after `collectDue` had succeeded, the customer
        had paid in full and the order was still sitting on the advance board
        waiting to be collected again.

        The claim comes FIRST and is the one-winner guard; the money follows, and
        if the money cannot be taken the claim is given back so the order returns
        to the board exactly as it was.  */
    await this.prisma.db.$transaction(async (tx) => {
      if (trackedItems.length) await this.assertStock(tx as unknown as Prisma.TransactionClient, trackedItems, wantedMilli, true);
      const claimed = await tx.order.updateMany({
        where: { id: o.id, salesStatus: SalesStatus.placed },
        data: { salesStatus: SalesStatus.completed, deliveryStatus: DeliveryStatus.delivered },
      });
      if (claimed.count !== 1) throw new BadRequestException('this order has already been handed over');
    });

    /*  take whatever is still owed — one dialog, same rules as any other money
        that comes in (POS-REV-6 validation lives in collectDue). It opens its
        own transaction, so it cannot join the claim above; a refusal here gives
        the claim back rather than leaving a paid-for order on nobody's list.  */
    if (dto.payments?.length) {
      try {
        await this.collectDue({ orderId: o.id, payments: dto.payments, actorName });
      } catch (e) {
        await this.prisma.db.order.updateMany({
          where: { id: o.id, salesStatus: SalesStatus.completed },
          data: { salesStatus: SalesStatus.placed, deliveryStatus: DeliveryStatus.unassigned },
        });
        throw e;
      }
    }

    // NOW the stock leaves (INV-RULE-001), the same call the walk-in path makes
    try {
      const r = await this.inventory.postSaleForOrder({
        orderId: o.id, orderNo: o.orderNo, actor: actorName, direction: -1,
        lines: o.lines.map((l) => ({
          productId: l.productId ?? null,
          itemId: (l as { itemId?: string | null }).itemId ?? null,
          qty: l.qty,
          // DEC-POS-024 — the snapshot decides how much stock leaves, not the qty
          qtyMilliOverride: (l as { unitQtyMilli?: number | null }).unitQtyMilli ?? undefined,
        })),
      });
      if (r.skipped.length) {
        await this.audit.event({ entityType: 'Order', entityId: o.id, kind: 'system', label: `Inventory: ${r.posted} movement(s); skipped (no item link): ${r.skipped.join(', ')}`, actorName });
      }
    } catch (e) {
      await this.audit.event({ entityType: 'Order', entityId: o.id, kind: 'system', label: `Inventory mirror failed: ${e instanceof Error ? e.message : 'error'}`, actorName });
    }

    // …and only now is it revenue and cost of goods
    await this.book(o.id, `POS sale ${o.orderNo} (advance handed over)`, () => this.financeEvents.onPosSale(o.id), actorName);
    await this.audit.event({ entityType: 'Order', entityId: o.id, kind: 'sales', label: `Advance order ${o.orderNo} handed over`, actorName });

    return this.prisma.db.order.findFirst({ where: { id: o.id } });
  }

  async collectDue(dto: CollectDueDto) {
    /*  audit 11 Sep 2026 §3 #23 — COUNTER ONLY. This took ANY orderId, with no
        guard at all, and would happily write a POS `SALE_CASH` drawer movement
        against an online order whose money never came near the till. Not
        reachable from the current screens; the endpoint was wide open.  */
    const o = await this.prisma.db.order.findFirst({
      where: { id: dto.orderId, fulfillmentType: FulfillmentType.COUNTER },
    });
    if (!o) throw new NotFoundException('counter bill not found');
    if (o.salesStatus === SalesStatus.cancelled) {
      throw new BadRequestException('that bill was voided — there is nothing to collect on it');
    }
    const actorName = dto.actorName ?? 'Cashier';
    const lines = dto.payments ?? [];

    // POS-REV-6, same rule as a sale: refuse a bad tender, never discard it quietly
    for (const p of lines) {
      if (!Number.isInteger(p.amountPaisa) || p.amountPaisa <= 0) {
        throw new BadRequestException(`${p.method} amount must be a positive whole number of paisa`);
      }
      if (!TENDER_METHOD[p.method as PosTender]) throw new BadRequestException(`unknown tender: ${p.method}`);
      await this.payMethods.assertActive(p.method); // DEC-GBL-001
      (p as { accountId?: string }).accountId =
        (await this.payMethods.resolveAccount(p.method, (p as { accountId?: string }).accountId)) ?? undefined;
    }
    const amount = lines.reduce((s, p) => s + p.amountPaisa, 0);
    if (amount <= 0) throw new BadRequestException('enter an amount to collect');
    /*  the friendly refusal; the BINDING one is the claim inside the
        transaction below, which is the whole point of audit §1 #3  */
    const outstanding = Math.max(0, o.totalPaisa - (o.paidPaisa - o.refundPaisa));
    if (amount > outstanding) throw new BadRequestException(`cannot collect ${amount} — only ${outstanding} is outstanding`);

    const cashAmount = lines
      .filter((p) => p.method === 'cash')
      .reduce((s, p) => s + p.amountPaisa, 0);
    /*  POS-REV-4 — the drawer the money actually went into. Owner, 11 Sep 2026:
        the box opens itself when money arrives, exactly as it does for a sale,
        so cash collected first thing in the morning has somewhere to be.  */
    const drawer = cashAmount > 0 ? await this.openDrawerIfNeeded(actorName) : null;

    const { updated, txnIds } = await this.prisma.db.$transaction(async (tx) => {
      /*  ═══ ONE COLLECTION PER OUTSTANDING TAKA — audit §1 #3 ═══════════════
          POS-REV-3 fixed the lost UPDATE with `increment`, but the CEILING was
          still check-then-write, outside the transaction. Two collections of
          the same bill at once (two tills, a retried click) both passed the
          check above, `paidPaisa` ended above `totalPaisa`, `duePaisa` was
          clamped to 0 by `Math.max` — and two `SALE_CASH` movements hit the
          drawer. The customer paid once, the drawer expected twice, and no
          screen anywhere showed the overpayment.

          So the claim IS the check: the row moves only if it still owes at
          least this much, and `count === 1` is the proof. The loser is told to
          look again rather than being handed a silent success.  */
      const claimed = await tx.order.updateMany({
        where: { id: o.id, duePaisa: { gte: amount } },
        data: { paidPaisa: { increment: amount }, duePaisa: { decrement: amount } },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException(
          'somebody collected against this bill a moment ago — reload the due board and check what is left',
        );
      }

      const ids: string[] = [];
      for (const p of lines) {
        const txn = await tx.paymentTransaction.create({
          data: {
            orderId: o.id,
            kind: PaymentTxnKind.PAYMENT,
            method: TENDER_METHOD[p.method as PosTender],
            amountPaisa: p.amountPaisa,
            actorName,
            ...({ accountId: (p as { accountId?: string }).accountId ?? null } as object),
          },
        });
        ids.push(txn.id);
      }

      if (cashAmount > 0 && drawer) {
        await tx.posCashMovement.create({
          data: { shiftId: drawer.id, kind: PosCashKind.SALE_CASH, amountPaisa: cashAmount, note: `${o.orderNo} due`, actorName },
        });
      }

      /*  the money has already moved on the row (the claim above); this only
          settles the STATUS, and `refundPaisa` is read inside the transaction so
          it cannot be decided from a stale figure (POS-REV-3)  */
      const bumped = await tx.order.findFirstOrThrow({
        where: { id: o.id },
        select: { id: true, totalPaisa: true, paidPaisa: true, refundPaisa: true, duePaisa: true },
      });
      const stillDue = Math.max(0, bumped.totalPaisa - (bumped.paidPaisa - bumped.refundPaisa));
      const settled = await tx.order.update({
        where: { id: o.id },
        data: {
          duePaisa: stillDue,
          paymentStatus: stillDue === 0 ? PaymentStatus.paid : PaymentStatus.advance_paid,
        },
      });
      return { updated: settled, txnIds: ids };
    });

    // POS-REV-5 — awaited and flagged, like every other finance hand-off in this file
    for (const id of txnIds) {
      await this.book(o.id, `due collected on ${o.orderNo}`, () => this.financeEvents.onPaymentRecorded(id), actorName);
    }

    /* POS-REV-4 — if there was cash and no shift open, say so on the order timeline.
       Silence is what made this invisible; the cash still has to be findable. */
    if (cashAmount > 0 && !drawer) {
      await this.audit.event({
        entityType: 'Order', entityId: o.id, kind: 'system',
        label: `⚠ ${(cashAmount / 100).toFixed(2)} tk cash collected with NO shift open — it is in the ledger but in nobody's drawer. Open a shift and record it as an adjustment.`,
        actorName,
      });
    }

    await this.audit.event({ entityType: 'Order', entityId: o.id, kind: 'payment', label: `Due collected ${amount} paisa`, actorName });
    return updated;
  }

  /* ------------------------------------------------ held carts (DEC-POS-011) */

  async listHeld() {
    return this.prisma.db.posHeldCart.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }

  async createHeld(dto: { label: string; registerId?: string; payload: Prisma.InputJsonValue }) {
    return this.prisma.db.posHeldCart.create({ data: { label: dto.label, registerId: dto.registerId, payload: dto.payload } });
  }

  async deleteHeld(id: string) {
    await this.prisma.db.posHeldCart.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  /* ------------------------------------------------ analytics (server-side, DEC-POS-014) */

  /**
   * P7-4 (31 Aug) — "today" means the SHOP's day, not the server's.
   *
   * This used `setHours(0, 0, 0, 0)`, which is midnight wherever the container
   * happens to think it is — UTC in production, so the till's day silently ran
   * from 6 AM Dhaka to 6 AM Dhaka. A shop that sells at midnight (this one
   * advertises it) put those bills on the previous day: POS-000014 was rung up
   * at 3:24 AM Dhaka on 26 Aug and counted towards the 25th.
   *
   * Every other part of the system already turns a moment into a Dhaka day the
   * same way — delivery analytics, the discount window, capacity, the inbox.
   */
  async analyticsToday() {
    const start = new Date(startOfBdDay(new Date()));
    const orders = await this.prisma.db.order.findMany({
      where: { fulfillmentType: FulfillmentType.COUNTER, placedAt: { gte: start } },
      select: { totalPaisa: true, duePaisa: true },
    });
    const salesPaisa = orders.reduce((s, o) => s + o.totalPaisa, 0);
    const count = orders.length;
    const duePaisa = orders.reduce((s, o) => s + o.duePaisa, 0);
    const shift = await this.currentShift();
    const cashInDrawer = shift
      ? await this.expectedCash(shift.id, shift.openingFloatPaisa)
      : 0;
    return { salesPaisa, count, avgPaisa: count ? Math.round(salesPaisa / count) : 0, duePaisa, cashInDrawer, shiftOpen: !!shift };
  }
}
