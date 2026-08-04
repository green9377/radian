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
import { SuppliersService } from './suppliers.service';
import { Roles } from '../auth/auth.guard';
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
  Supplier — HTTP surface. RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md (23 Jul 2026).
  ⚠️ ROUTE ORDER: static paths (`stats`, `types`, `unlinked-names`) MUST sit
  ABOVE `:id` routes — the same Nest trap as /purchases and /products.
*/
/*  Supplier terms and outstanding dues are money facts — MANAGER and above. */
@Controller('suppliers')
@Roles('OWNER', 'MANAGER')
export class SuppliersController {
  constructor(private readonly svc: SuppliersService) {}

  @Get()
  list(@Query() q: SupplierListQuery) {
    return this.svc.list(q);
  }

  /* ---- static routes first ---- */

  @Get('stats')
  stats() {
    return this.svc.stats();
  }

  @Get('types')
  types() {
    return this.svc.listTypes();
  }

  @Post('types')
  createType(@Body() dto: SupplierTypeDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.createType({ ...dto, actorName: dto.actorName ?? actor });
  }

  @Patch('types/:id')
  updateType(@Param('id') id: string, @Body() dto: SupplierTypeDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.updateType(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  @Delete('types/:id')
  removeType(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.removeType(id, actor ?? 'Admin');
  }

  @Get('unlinked-names')
  unlinkedNames() {
    return this.svc.unlinkedNames();
  }

  /* ---- per-supplier routes ---- */

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Get(':id/ledger')
  ledger(@Param('id') id: string) {
    return this.svc.ledger(id);
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.svc.timeline(id);
  }

  @Get(':id/pay-preview')
  payPreview(@Param('id') id: string, @Query('amountPaisa') amountPaisa: string) {
    return this.svc.payPreview(id, parseInt(amountPaisa, 10) || 0);
  }

  @Post()
  create(@Body() dto: SupplierCreateDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: SupplierPatch, @Headers('x-actor-name') actor?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  @Post(':id/payments')
  pay(@Param('id') id: string, @Body() dto: SupplierPayDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.pay(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  @Post(':id/adjustments')
  adjust(@Param('id') id: string, @Body() dto: SupplierAdjustDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.adjust(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  /** SUP-R11 — consume a credit against the current due */
  @Post(':id/credits/:creditId/apply')
  applyCredit(
    @Param('id') id: string,
    @Param('creditId') creditId: string,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.applyCredit(id, creditId, actor ?? 'Admin');
  }

  @Post(':id/link-names')
  linkNames(@Param('id') id: string, @Body() dto: LinkNamesDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.linkNames(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}
