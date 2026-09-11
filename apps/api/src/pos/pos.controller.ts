import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { PosService } from './pos.service';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { costFor } from '../common/strip-cost';
import type {
  OpenShiftDto,
  CloseShiftDto,
  CashMovementDto,
  PosCashOutDto,
  CreatePosSaleDto,
  PosPaymentDto,
  CollectDueDto,
  DiscountRuleInput,
  UpdatePosSettingsDto,
  CreateRegisterDto,
  PosDiscountApproveDto,
  VoidPosSaleDto,
} from './pos.dto';
import type { Prisma } from '@prisma/client';

/* /pos — POS module API (RADIAN_POS_MODULE_ARCHITECTURE.md §8).
   Static routes are declared above any ':id' route (Nest route-order trap). */
@Controller('pos')
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Get('analytics/today')
  analyticsToday() {
    return this.pos.analyticsToday();
  }

  /** DEC-POS-018 — what the till may sell: items, never products */
  @Get('catalogue')
  async catalogue(
    @Req() req: AuthedRequest,
    @Query('search') search?: string,
    /*  audit 11 Sep 2026 §3 #13 — `search` was already accepted here and was
        never sent; the till pulled 500 rows and filtered them in the browser,
        so item 501 could not be sold. `limit` is the other half.  */
    @Query('limit') limit?: string,
  ) {
    /*  DEC-ADM-012 — a cashier sees the selling price; the cost only reaches the
        people whose template says so, and it is removed here, not hidden there.  */
    return costFor(req.actor?.canSeeCost, await this.pos.catalogue(search, limit ? Number(limit) : undefined));
  }

  /**
   * audit 11 Sep 2026 §3 #14 — counter customer lookup, answered by the server.
   * The picker used to load the first 100 customers and search them in the
   * browser, so a regular past #100 was unfindable and the cashier created a
   * duplicate by typing the phone again.
   */
  @Get('customers')
  customers(@Query('search') search?: string, @Query('limit') limit?: string) {
    return this.pos.customers(search, limit ? Number(limit) : undefined);
  }

  /* registers */
  @Get('registers')
  registers() {
    return this.pos.registers();
  }
  @Post('registers')
  createRegister(@Body() dto: CreateRegisterDto) {
    return this.pos.createRegister(dto);
  }

  /*  ── THE DAY (owner, 11 Sep 2026) ──────────────────────────────────────
      One counter, one day: what came in today and how. The shift routes below
      stay — the cash box is still a row, and Finance still consumes its close
      — but nothing asks a person to open or pick one any more.  */
  @Get('day')
  day(@Query('date') date?: string) {
    return this.pos.day(date);
  }
  @Post('day/close')
  closeDay(@Body() dto: CloseShiftDto) {
    return this.pos.closeDay(dto);
  }

  /* shifts — the cash box behind the day; no screen opens one by hand */
  @Get('shifts/current')
  currentShift(@Query('registerId') registerId?: string) {
    return this.pos.currentShift(registerId);
  }
  @Post('shifts/open')
  openShift(@Body() dto: OpenShiftDto) {
    return this.pos.openShift(dto);
  }
  /* P7-1 — the shift's own takings, not the calendar day's */
  @Get('shifts/:id/summary')
  shiftSummary(@Param('id') id: string) {
    return this.pos.shiftSummary(id);
  }
  @Post('shifts/:id/close')
  closeShift(@Param('id') id: string, @Body() dto: CloseShiftDto) {
    return this.pos.closeShift(id, dto);
  }
  @Post('shifts/:id/cash')
  cashMovement(@Param('id') id: string, @Body() dto: CashMovementDto) {
    return this.pos.addCashMovement(id, dto);
  }
  /*  P7-2 — cash out of the till, always with a heading behind it. Finance
      writes the expense (or the transfer, for a bank drop); POS only records
      that the drawer is lighter.  */
  @Post('shifts/:id/cash-out')
  takeCashOut(@Param('id') id: string, @Body() dto: PosCashOutDto) {
    return this.pos.takeCashOut(id, dto);
  }

  /* sales */
  @Post('sales')
  createSale(@Body() dto: CreatePosSaleDto) {
    return this.pos.createSale(dto);
  }
  @Get('sales')
  listSales(@Query('search') search?: string, @Query('days') days?: string) {
    return this.pos.listSales({ search, days: days ? Number(days) : undefined });
  }

  /**
   * audit 11 Sep 2026 §3 #21 — the counter's own undo. Same-day only, and only
   * for a bill Returns has not already touched; everything else stays with the
   * Returns workflow.
   */
  @Post('sales/:id/void')
  voidSale(@Param('id') id: string, @Body() dto: VoidPosSaleDto) {
    return this.pos.voidSale(id, dto);
  }

  /**
   * audit 11 Sep 2026 §4 — everything a printed slip needs, resolved on the
   * server so the paper cannot disagree with the books. `receiptHeader`,
   * `receiptFooter` and `giftReceiptHidePrice` have been editable in settings
   * since the module was built and nothing read any of them until now.
   */
  @Get('sales/:id/receipt')
  receipt(@Param('id') id: string) {
    return this.pos.receipt(id);
  }

  /* due */
  /* DEC-POS-027 — what this customer already owes the counter, and the ceiling */
  @Get('credit/:customerId')
  creditStanding(@Param('customerId') customerId: string) {
    return this.pos.creditStanding(customerId);
  }

  @Get('due')
  dueBoard() {
    return this.pos.dueBoard();
  }
  @Post('due/collect')
  collectDue(@Body() dto: CollectDueDto) {
    return this.pos.collectDue(dto);
  }

  /* advance orders (DEC-POS-022) */
  @Get('advance')
  advanceOrders() {
    return this.pos.advanceOrders();
  }
  @Post('advance/:id/handover')
  handOverAdvance(@Param('id') id: string, @Body() dto: { payments?: PosPaymentDto[]; actorName?: string }) {
    return this.pos.handOverAdvance(id, dto);
  }

  /* settings */
  @Get('settings')
  settings() {
    return this.pos.settings();
  }
  @Patch('settings')
  updateSettings(@Body() dto: UpdatePosSettingsDto) {
    return this.pos.updateSettings(dto);
  }

  /**
   * audit 11 Sep 2026 §3 #17 — the over-cap discount gate, off the browser.
   *
   * `MANAGER_PIN = "1234"` shipped inside the admin bundle and the server then
   * accepted any non-empty approver string. The PIN is now checked here against
   * a real OWNER/MANAGER account and the till never holds one; what it gets back
   * is a one-shot token the sale must present.
   */
  @Post('discount/approve')
  @Roles('OWNER', 'MANAGER')
  approveDiscount(@Req() req: AuthedRequest, @Body() dto: PosDiscountApproveDto) {
    return this.pos.approveDiscount(dto, req.actor);
  }

  /* discount rules */
  @Get('discount-rules')
  discountRules() {
    return this.pos.discountRules();
  }
  @Put('discount-rules')
  replaceDiscountRules(@Body() body: { rules: DiscountRuleInput[] }) {
    return this.pos.replaceDiscountRules(body.rules ?? []);
  }

  /* held carts */
  @Get('held')
  listHeld() {
    return this.pos.listHeld();
  }
  @Post('held')
  createHeld(@Body() dto: { label: string; registerId?: string; payload: Prisma.InputJsonValue }) {
    return this.pos.createHeld(dto);
  }
  @Delete('held/:id')
  deleteHeld(@Param('id') id: string) {
    return this.pos.deleteHeld(id);
  }
}
