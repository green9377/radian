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
import { ItemsService } from './items.service';
import { Roles } from '../auth/auth.guard';
import type {
  ItemDto,
  ItemPatch,
  ComponentDto,
  ComponentPatch,
  ItemListQuery,
  VariantGenerateDto,
} from './item.dto';

/*
  Item Management — HTTP surface.

  ⚠️ ROUTE ORDER: every static path (`/items/generate-from-products`, `/items/components/:lineId`)
  MUST be declared ABOVE `@Get(':id')` / `@Patch(':id')`, otherwise Nest matches the
  literal segment as an id. Same trap as `/products/analytics` (§১০.৩).
*/
@Controller('items')
export class ItemsController {
  constructor(private readonly svc: ItemsService) {}

  @Get()
  list(@Query() q: ItemListQuery) {
    return this.svc.list(q);
  }

  /* ---- static routes first ---- */

  // DEC-ITM-009 — one click, idempotent
  @Post('generate-from-products')
  generate(@Headers('x-actor-name') actor?: string) {
    return this.svc.generateFromProducts(actor ?? 'Admin');
  }

  // DEC-ITM-016 — "Rose" + Colour[Red, Yellow, White] -> three independent Items
  @Post('generate-variants')
  generateVariants(@Body() dto: VariantGenerateDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.generateVariants({ ...dto, actorName: dto.actorName ?? actor });
  }

  /** soft-deleted items — the Trash screen */
  @Get('trash')
  trash() {
    return this.svc.trash();
  }

  /** every assembled item with its lines + what its products sell for */
  @Get('recipes')
  recipes() {
    return this.svc.recipes();
  }

  @Patch('components/:lineId')
  updateComponent(
    @Param('lineId') lineId: string,
    @Body() dto: ComponentPatch,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.updateComponent(lineId, { ...dto, actorName: dto.actorName ?? actor });
  }

  @Roles('OWNER', 'MANAGER')
  @Delete('components/:lineId')
  removeComponent(@Param('lineId') lineId: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.removeComponent(lineId, actor ?? 'Admin');
  }

  /* ---- per-item routes ---- */

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Get(':id/usage')
  usage(@Param('id') id: string) {
    return this.svc.usage(id);
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.svc.timeline(id);
  }

  @Post()
  create(@Body() dto: ItemDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: ItemPatch,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  /** `?detach=1` unlinks any Products pointing at this item, then deletes it (ITM-R07) */
  @Roles('OWNER', 'MANAGER')
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Query('detach') detach?: string,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.remove(id, actor ?? 'Admin', detach === '1' || detach === 'true');
  }

  @Post(':id/restore')
  restore(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.restore(id, actor ?? 'Admin');
  }

  /**
   * ITM-R14 — permanent destruction, trash only.
   *
   * It is a POST and not a DELETE on purpose: a DELETE with no body could be replayed
   * from a browser history entry or a mis-wired retry, and this is the one call in the
   * module with no undo. The caller must send back the item's own SKU, so the request
   * cannot be constructed without having actually looked at the thing being destroyed.
   */
  @Post(':id/purge')
  purge(
    @Param('id') id: string,
    @Body() body: { confirmSku?: string },
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.purge(id, actor ?? 'Admin', (body?.confirmSku ?? '').trim());
  }

  /* ---- recipe (DEC-ITM-003) ---- */

  @Post(':id/components')
  addComponent(
    @Param('id') id: string,
    @Body() dto: ComponentDto,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.addComponent(id, { ...dto, actorName: dto.actorName ?? actor });
  }
}
