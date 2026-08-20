import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { PosService } from './pos.service';
import type { AuthedRequest } from '../auth/auth.guard';
import { costFor } from '../common/strip-cost';
import type {
  OpenShiftDto,
  CloseShiftDto,
  CashMovementDto,
  CreatePosSaleDto,
  CollectDueDto,
  DiscountRuleInput,
  UpdatePosSettingsDto,
  CreateRegisterDto,
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
  async catalogue(@Req() req: AuthedRequest, @Query('search') search?: string) {
    /*  DEC-ADM-012 — a cashier sees the selling price; the cost only reaches the
        people whose template says so, and it is removed here, not hidden there.  */
    return costFor(req.actor?.canSeeCost, await this.pos.catalogue(search));
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

  /* shifts */
  @Get('shifts/current')
  currentShift(@Query('registerId') registerId?: string) {
    return this.pos.currentShift(registerId);
  }
  @Post('shifts/open')
  openShift(@Body() dto: OpenShiftDto) {
    return this.pos.openShift(dto);
  }
  @Post('shifts/:id/close')
  closeShift(@Param('id') id: string, @Body() dto: CloseShiftDto) {
    return this.pos.closeShift(id, dto);
  }
  @Post('shifts/:id/cash')
  cashMovement(@Param('id') id: string, @Body() dto: CashMovementDto) {
    return this.pos.addCashMovement(id, dto);
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

  /* due */
  @Get('due')
  dueBoard() {
    return this.pos.dueBoard();
  }
  @Post('due/collect')
  collectDue(@Body() dto: CollectDueDto) {
    return this.pos.collectDue(dto);
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
