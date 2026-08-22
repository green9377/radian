import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
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
  Inventory — HTTP surface. RADIAN_INVENTORY_MODULE_ARCHITECTURE.md (22 Jul 2026).

  ⚠️ ROUTE ORDER: static paths MUST sit above param routes — same Nest trap as
  /products/analytics (§10.3) and the purchases controller.

  ⚠️ INV-RULE-002: there is deliberately NO update/delete endpoint for movements —
  the ledger is immutable. Do not add one.
*/
@Controller('inventory')
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}

  /* ---- boards ---- */

  @Get('overview')
  overview() {
    return this.svc.overview();
  }

  @Get('stock')
  stock(@Query() q: StockBoardQuery) {
    return this.svc.stockBoard(q);
  }

  @Get('movements')
  movements(@Query() q: MovementListQuery) {
    return this.svc.movements(q);
  }

  @Get('warehouses')
  warehouses() {
    return this.svc.warehouses();
  }

  /* ---- warehouses, DEC-INV-017 — the owner makes his own stores ---- */

  @Post('warehouses')
  createWarehouse(
    @Body() dto: { code: string; name: string; address?: string; actorName?: string },
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.createWarehouse({ ...dto, actorName: dto.actorName ?? actor });
  }

  @Patch('warehouses/:id')
  updateWarehouse(
    @Param('id') id: string,
    @Body() dto: { name?: string; address?: string | null; isActive?: boolean; actorName?: string },
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.updateWarehouse(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  @Delete('warehouses/:id')
  deleteWarehouse(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.deleteWarehouse(id, actor);
  }

  @Get('settings')
  settings() {
    return this.svc.settings();
  }

  /*  DEC-GBL-004 — the reasons goods leave for, editable at last  */
  @Get('issue-reasons')
  issueReasons(@Query('purpose') purpose?: string) {
    return this.svc.issueReasons(purpose);
  }

  @Patch('issue-reasons/:id')
  updateIssueReason(
    @Param('id') id: string,
    @Body() dto: { label?: string },
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.updateIssueReason(id, dto, actor ?? 'Admin');
  }

  @Delete('issue-reasons/:id')
  deleteIssueReason(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.deleteIssueReason(id, actor ?? 'Admin');
  }

  @Get('reports/issue-analysis')
  issueAnalysis(@Query('days') days?: string) {
    return this.svc.issueAnalysis(days ? Math.max(1, parseInt(days, 10)) : 30);
  }

  @Post('issue-reasons')
  addIssueReason(
    @Body() dto: { purpose?: string; label?: string },
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.addIssueReason(dto.purpose ?? '', dto.label ?? '', actor ?? 'Admin');
  }

  @Patch('settings')
  updateSettings(@Body() dto: SettingsPatch, @Headers('x-actor-name') actor?: string) {
    return this.svc.updateSettings({ ...dto, actorName: dto.actorName ?? actor });
  }

  /** itemStockLabel() data source (DEC-ITM-005 addendum) */
  @Get('item-stock/:itemId')
  itemStock(@Param('itemId') itemId: string) {
    return this.svc.itemStock(itemId);
  }

  /* ---- flows ---- */

  @Post('opening')
  opening(@Body() dto: OpeningDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.opening({ ...dto, actorName: dto.actorName ?? actor });
  }

  @Get('transfers')
  listTransfers() {
    return this.svc.listTransfers();
  }

  @Post('transfers')
  createTransfer(@Body() dto: TransferCreateDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.createTransfer({ ...dto, actorName: dto.actorName ?? actor });
  }

  @Get('transfers/:id')
  getTransfer(@Param('id') id: string) {
    return this.svc.getTransfer(id);
  }

  @Get('issues')
  listIssues(@Query('kind') kind?: string) {
    return this.svc.listIssues(kind);
  }

  @Post('issues')
  createIssue(@Body() dto: IssueCreateDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.createIssue({ ...dto, actorName: dto.actorName ?? actor });
  }

  @Get('issues/:id')
  getIssue(@Param('id') id: string) {
    return this.svc.getIssue(id);
  }

  @Post('adjustments')
  adjust(@Body() dto: AdjustmentDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.adjust({ ...dto, actorName: dto.actorName ?? actor });
  }

  @Get('stocktakes')
  listStocktakes() {
    return this.svc.listStocktakes();
  }

  @Post('stocktakes')
  createStocktake(@Body() dto: StocktakeCreateDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.createStocktake({ ...dto, actorName: dto.actorName ?? actor });
  }

  @Get('stocktakes/:id')
  getStocktake(@Param('id') id: string) {
    return this.svc.getStocktake(id);
  }

  @Post('stocktakes/:id/apply')
  applyStocktake(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.applyStocktake(id, actor);
  }

  /* ---- reports ---- */

  @Get('reports/issues')
  issueReport(@Query('days') days?: string) {
    return this.svc.issueReport(parseInt(days ?? '30', 10) || 30);
  }

  @Get('reports/valuation')
  valuationReport() {
    return this.svc.valuationReport();
  }
}
