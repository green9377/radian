import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { NeedsPin, Roles } from '../auth/auth.guard';
import { FinanceService } from './finance.service';
import { FinanceEventsService } from './finance-events.service';
import {
  FinanceAssetsService,
  type AssetWriteDto,
  type PrepaidWriteDto,
  type LoanWriteDto,
  type LoanPaymentDto,
  type RemitDto,
} from './finance-assets.service';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceDriftService } from './finance-drift.service';
import { FinanceMushakService } from './finance-mushak.service';
import { FinanceGatewayService, type GatewaySettleDto } from './finance-gateway.service';
import type {
  AccountWriteDto,
  SettingsWriteDto,
  ReconcileDto,
  PostOpeningDto,
  ExpenseWriteDto,
  IncomeWriteDto,
  TransferWriteDto,
  PartnerWriteDto,
  PartnerTxnDto,
  ApprovalActionDto,
  RecurringWriteDto,
  StaffAdvanceDto,
  StaffSalaryDto,
  ManualJournalDto,
} from './finance.dto';

/*  Static paths above any ':id' (project rule).

    DEC-FIN-028 — the guard and the actor interceptor are global now (AuthModule),
    so every route here already needs a signed-in user and the ones that move
    money re-ask for the 4-digit PIN. The name that lands in the ledger comes
    from the SESSION (`req.actor`), never from a field somebody typed.

    On top of that: money is not for everyone. The whole module is closed to
    STAFF — a salesperson should not be able to read what a bouquet cost us or
    how thin this month was. Individual routes below narrow further to OWNER
    where the decision is the owner's alone (capital, profit sharing, opening
    balances, manual journals, closing a month). */
@Controller('finance')
@Roles('OWNER', 'MANAGER')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly events: FinanceEventsService,
    private readonly assets: FinanceAssetsService,
    private readonly reports: FinanceReportsService,
    private readonly drift: FinanceDriftService,
    private readonly mushak: FinanceMushakService,
    private readonly gateway: FinanceGatewayService,
  ) {}

  /* ---- settings ---- */
  @Get('settings')
  settings() {
    return this.finance.settings();
  }

  @Roles('OWNER')
  @Patch('settings')
  updateSettings(@Body() dto: SettingsWriteDto) {
    return this.finance.updateSettings(dto);
  }

  /* ---- overview ---- */
  @Get('overview')
  overview(@Query('monthsBack') monthsBack?: string) {
    return this.finance.overview(monthsBack ? Number(monthsBack) : 0);
  }

  /* ---- accounts ---- */
  @Get('accounts')
  accounts() {
    return this.finance.accounts();
  }

  @Get('accounts/summary')
  accountsSummary() {
    return this.finance.accountsSummary();
  }

  @Post('accounts')
  createAccount(@Body() dto: AccountWriteDto) {
    return this.finance.createAccount(dto);
  }

  @Patch('accounts/:id')
  updateAccount(@Param('id') id: string, @Body() dto: AccountWriteDto) {
    return this.finance.updateAccount(id, dto);
  }

  @Delete('accounts/:id')
  removeAccount(@Param('id') id: string) {
    return this.finance.removeAccount(id);
  }

  /* ---- opening balances (W6) ---- */
  @Roles('OWNER')
  @NeedsPin()
  @Post('opening')
  postOpening(@Body() dto: PostOpeningDto) {
    return this.finance.postOpening(dto);
  }

  /* ---- reconciliation (W5) ---- */
  @Get('reconciliations')
  reconciliations(@Query('accountId') accountId?: string) {
    return this.finance.reconciliations(accountId);
  }

  @NeedsPin()
  @Post('reconcile')
  reconcile(@Body() dto: ReconcileDto) {
    return this.finance.reconcile(dto);
  }

  /* ---- ledger ---- */
  @Get('ledger')
  ledger(
    @Query('accountId') accountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('take') take?: string,
  ) {
    return this.finance.ledger({
      accountId,
      from,
      to,
      take: take ? Number(take) : undefined,
    });
  }

  /* ---- expense ---- */
  @Get('expenses')
  expenses(@Query('approval') approval?: string) {
    return this.finance.expenses({ approval });
  }

  @Post('expenses')
  createExpense(@Body() dto: ExpenseWriteDto) {
    return this.finance.createExpense(dto);
  }

  @NeedsPin()
  @Post('expenses/:id/approve')
  approveExpense(@Param('id') id: string, @Body() dto: ApprovalActionDto) {
    return this.finance.approveExpense(id, dto);
  }

  @Post('expenses/:id/decline')
  declineExpense(@Param('id') id: string, @Body() dto: ApprovalActionDto) {
    return this.finance.declineExpense(id, dto);
  }

  @Delete('expenses/:id')
  removeExpense(@Param('id') id: string) {
    return this.finance.removeExpense(id);
  }

  /* ---- income ---- */
  @Get('income')
  incomes() {
    return this.finance.incomes();
  }

  @NeedsPin()
  @Post('income')
  createIncome(@Body() dto: IncomeWriteDto) {
    return this.finance.createIncome(dto);
  }

  /* ---- transfer between our own accounts ---- */
  @Get('transfers')
  transfers() {
    return this.finance.transfers();
  }

  @NeedsPin()
  @Post('transfers')
  createTransfer(@Body() dto: TransferWriteDto) {
    return this.finance.createTransfer(dto);
  }

  /* ---- DEC-FIN-030 — what the payment gateway still owes, and paying it over ----

     Not a second kind of transfer: `settle` posts through `createTransfer`
     below. What is here is the part that is about gateways — the balance to
     hold against SSLCommerz's own "Unsettled Payable", and the ceiling that
     stops a mistyped payout leaving an orphan on the Gateway account. */
  @Get('gateway')
  gatewaySummary() {
    return this.gateway.summary();
  }

  @NeedsPin()
  @Post('gateway/settle')
  gatewaySettle(@Body() dto: GatewaySettleDto) {
    return this.gateway.settle(dto);
  }

  /* ---- partners ---- */
  @Get('partners')
  partners() {
    return this.finance.partners();
  }

  @Roles('OWNER')
  @Post('partners')
  createPartner(@Body() dto: PartnerWriteDto) {
    return this.finance.createPartner(dto);
  }

  @Roles('OWNER')
  @Patch('partners/:id')
  updatePartner(@Param('id') id: string, @Body() dto: PartnerWriteDto) {
    return this.finance.updatePartner(id, dto);
  }

  @Roles('OWNER')
  @Delete('partners/:id')
  removePartner(@Param('id') id: string) {
    return this.finance.removePartner(id);
  }

  @Roles('OWNER')
  @NeedsPin()
  @Post('partner-transactions')
  partnerTransaction(@Body() dto: PartnerTxnDto) {
    return this.finance.partnerTransaction(dto);
  }

  /* ---- recurring expense (G1) ---- */
  @Get('recurring')
  recurring() {
    return this.finance.recurring();
  }

  @Post('recurring')
  createRecurring(@Body() dto: RecurringWriteDto) {
    return this.finance.createRecurring(dto);
  }

  @Patch('recurring/:id')
  updateRecurring(@Param('id') id: string, @Body() dto: RecurringWriteDto) {
    return this.finance.updateRecurring(id, dto);
  }

  @Delete('recurring/:id')
  removeRecurring(@Param('id') id: string) {
    return this.finance.removeRecurring(id);
  }

  @Post('recurring/:id/post')
  postRecurring(@Param('id') id: string, @Body() dto: { amountPaisa?: number; actorName?: string }) {
    return this.finance.postRecurring(id, dto);
  }

  /* ---- staff advance & salary (G2) ---- */
  @Get('staff-advances')
  staffAdvances() {
    return this.finance.staffAdvances();
  }

  @NeedsPin()
  @Post('staff-advances')
  giveStaffAdvance(@Body() dto: StaffAdvanceDto) {
    return this.finance.giveStaffAdvance(dto);
  }

  @NeedsPin()
  @Post('staff-salary')
  payStaffSalary(@Body() dto: StaffSalaryDto) {
    return this.finance.payStaffSalary(dto);
  }

  /* ---- accountant mode (G6) ---- */
  @Roles('OWNER')
  @NeedsPin()
  @Post('journal')
  manualJournal(@Body() dto: ManualJournalDto) {
    return this.finance.manualJournal(dto);
  }

  @Roles('OWNER')
  @NeedsPin()
  @Post('ledger/:id/reverse')
  reverseEntry(@Param('id') id: string, @Body() dto: { actorName?: string; reason?: string }) {
    return this.finance.reverseEntry(id, dto);
  }

  /* ---- carrier money (DEC-FIN-021) ---- */
  @Get('carrier')
  carrierOutstanding() {
    return this.assets.carrierOutstanding();
  }

  @Get('carrier/remittances')
  remittances() {
    return this.assets.remittances();
  }

  @NeedsPin()
  @Post('carrier/remit')
  remit(@Body() dto: RemitDto) {
    return this.assets.remit(dto);
  }

  /* ---- assets · prepaid · loans ---- */
  @Get('assets')
  assetList() {
    return this.assets.assets();
  }

  @Post('assets')
  createAsset(@Body() dto: AssetWriteDto) {
    return this.assets.createAsset(dto);
  }

  @Delete('assets/:id')
  removeAsset(@Param('id') id: string) {
    return this.assets.removeAsset(id);
  }

  @Get('prepaid')
  prepaidList() {
    return this.assets.prepaids();
  }

  @Post('prepaid')
  createPrepaid(@Body() dto: PrepaidWriteDto) {
    return this.assets.createPrepaid(dto);
  }

  @Delete('prepaid/:id')
  removePrepaid(@Param('id') id: string) {
    return this.assets.removePrepaid(id);
  }

  @Get('loans')
  loanList() {
    return this.assets.loans();
  }

  @Post('loans')
  createLoan(@Body() dto: LoanWriteDto) {
    return this.assets.createLoan(dto);
  }

  @Patch('loans/:id')
  updateLoan(@Param('id') id: string, @Body() dto: LoanWriteDto) {
    return this.assets.updateLoan(id, dto);
  }

  @Delete('loans/:id')
  removeLoan(@Param('id') id: string, @Body() dto: { actorName?: string }) {
    return this.assets.removeLoan(id, dto?.actorName);
  }

  @NeedsPin()
  @Post('loans/:id/payments')
  payLoan(@Param('id') id: string, @Body() dto: LoanPaymentDto) {
    return this.assets.payLoan(id, dto);
  }

  /* ---- month end + profit distribution ---- */
  @Roles('OWNER')
  @Get('distribution/preview')
  distributionPreview(@Query('from') from?: string, @Query('to') to?: string) {
    return this.assets.distributionPreview(from, to);
  }

  @Roles('OWNER')
  @NeedsPin()
  @Post('distribution')
  distribute(@Body() dto: { from?: string; to?: string; accountId?: string; actorName?: string }) {
    return this.assets.distribute(dto);
  }

  @Roles('OWNER')
  @Roles('OWNER')
  @NeedsPin()
  @Post('period/reopen')
  reopenPeriod(@Body() dto: { actorName?: string; reason?: string }) {
    return this.assets.reopenPeriod(dto);
  }

  @Roles('OWNER')
  @Post('month-end')
  monthEnd(@Body() dto: { actorName?: string; close?: boolean }) {
    return this.assets.monthEnd(dto);
  }

  /* ---- drift: do the books still match the shop? (G1) ----
         Runs by itself at 2 AM Bangladesh time and writes the verdict to the
         audit trail; these routes are for looking at it on demand. */
  /*  P7-13 — post the OPENING and ADJUSTMENT stock movements the books never
      heard about. Idempotent: run it twice and the second run posts nothing.  */
  @Post('backfill/stock-movements')
  backfillStock() {
    return this.events.backfillStockMovements();
  }

  @Get('drift')
  drift_() {
    return this.drift.run();
  }

  @Get('drift/history')
  driftHistory() {
    return this.drift.history();
  }

  @Post('drift/run')
  driftRun() {
    return this.drift.runAndRecord('Checked by hand');
  }

  /* ---- Mushak 6.3 · the government VAT challan (G3) ---- */
  @Get('mushak/readiness')
  mushakReadiness() {
    return this.mushak.readiness();
  }

  @Get('mushak/orders')
  mushakOrders() {
    return this.mushak.issuable();
  }

  @Get('mushak/:orderId')
  mushakChallan(@Param('orderId') orderId: string) {
    return this.mushak.challan(orderId);
  }

  /* ---- reports (all server-side, FIN-RULE-016) ---- */
  @Get('reports/pnl')
  pnl(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.profitAndLoss(from, to);
  }

  @Get('reports/aging')
  agingReport() {
    return this.reports.aging();
  }

  @Get('reports/balance-flow')
  balanceFlow(@Query('days') days?: string) {
    return this.reports.balanceFlow(days ? Number(days) : 30);
  }

  @Get('reports/leakage')
  leakage() {
    return this.reports.leakage();
  }

  @Get('reports/commitments')
  commitments() {
    return this.reports.commitments();
  }

  @Get('reports/trial-balance')
  trialBalance() {
    return this.reports.trialBalance();
  }

  @Get('reports/sales-breakdown')
  salesBreakdown(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.salesBreakdown(from, to);
  }

  /* ---- demo data (owner practice — clearable) ---- */
  @Post('demo/seed')
  demoSeed() {
    return this.finance.demoSeed();
  }

  @Roles('OWNER')
  @NeedsPin()
  @Post('demo/clear')
  demoClear() {
    return this.finance.demoClear();
  }

  @Post('failures/:id/replay')
  replayFailure(@Param('id') id: string) {
    return this.events.replay(id);
  }

  @Get('failures')
  failures() {
    return this.finance.failures();
  }
}
