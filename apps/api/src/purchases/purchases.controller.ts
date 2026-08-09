import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { Roles } from '../auth/auth.guard';
import type {
  PurchaseCreateDto,
  PurchasePatch,
  ReceiveDto,
  PaymentDto,
  ReturnCreateDto,
  PurchaseListQuery,
} from './purchase.dto';

/*
  Purchase — HTTP surface. RADIAN_PURCHASE_MODULE_ARCHITECTURE.md (22 Jul 2026).

  ⚠️ ROUTE ORDER: static paths (`stats`, `returns`, `credits`, `suppliers`,
  `price-history/:itemId`) MUST sit ABOVE `:id` routes — same Nest trap as
  `/products/analytics` (§১০.৩) and the items controller.
*/
/*  Buying commits our money and shows supplier cost — MANAGER and above.
    A salesperson has no business seeing what we pay per stem. */
@Controller('purchases')
@Roles('OWNER', 'MANAGER')
export class PurchasesController {
  constructor(private readonly svc: PurchasesService) {}

  @Get()
  list(@Query() q: PurchaseListQuery) {
    return this.svc.list(q);
  }

  /* ---- static routes first ---- */

  @Get('stats')
  stats() {
    return this.svc.stats();
  }

  @Get('returns')
  returns() {
    return this.svc.listReturns();
  }

  @Get('credits')
  credits() {
    return this.svc.listCredits();
  }

  /** free-text supplier autocomplete (DEC-PUR-003) */
  @Get('suppliers')
  suppliers(@Query('search') search?: string) {
    return this.svc.supplierNames(search);
  }

  @Get('price-history/:itemId')
  priceHistory(@Param('itemId') itemId: string) {
    return this.svc.priceHistory(itemId);
  }

  @Post('returns')
  createReturn(@Body() dto: ReturnCreateDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.createReturn({ ...dto, actorName: dto.actorName ?? actor });
  }

  /* ---- per-purchase routes ---- */

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.svc.timeline(id);
  }

  @Post()
  create(@Body() dto: PurchaseCreateDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: PurchasePatch, @Headers('x-actor-name') actor?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  @Post(':id/receive')
  receive(@Param('id') id: string, @Body() dto: ReceiveDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.receive(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  /** DEC-PUR-014 — repair: goods received but stock never moved */
  @Post(':id/repost-stock')
  repostStock(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.repostStock(id, actor);
  }

  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body() dto: PaymentDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.addPayment(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.cancel(id, actor ?? 'Admin', body?.note);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}
