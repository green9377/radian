import {
  BadRequestException,
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
import { ProductsService } from './products.service';
import { Roles } from '../auth/auth.guard';
import type { CreateProductDto, UpdateProductDto, ListProductQuery } from './product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() q: ListProductQuery) {
    return this.products.list(q);
  }

  /*  `days` COMES OFF THE WIRE (12 Sep 2026).

      It was `parseInt(days) || 30` and nothing else, so `?days=3650` pulled
      every order line the shop has ever written into memory to answer one
      screen, and `?days=-5` produced a window that ends before it starts and
      reported a shop with no sales - silently, as zeros, which is the worst
      way for a number to be wrong. A year is the most any product funnel is
      asked for; past that it is a report, and Reports can pass a real date
      range. Anything that is not a whole number of days is the caller's
      mistake and is told so rather than quietly becoming 30.  */
  private static days(raw: string | undefined): number {
    if (raw === undefined || raw.trim() === '') return 30;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1)
      throw new BadRequestException('days must be a whole number of days, 1 or more');
    return Math.min(365, n);
  }

  // NOTE: static route must stay ABOVE ':id', otherwise Nest treats
  // "analytics" as an id.
  @Get('analytics')
  analytics(@Query('days') days?: string) {
    return this.products.analytics(ProductsController.days(days));
  }

  // static route — must also stay ABOVE ':id'
  @Get('trash')
  trash(@Query() q: { page?: string; pageSize?: string }) {
    return this.products.trash(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  @Get(':id/analytics')
  productAnalytics(@Param('id') id: string, @Query('days') days?: string) {
    return this.products.productAnalytics(id, ProductsController.days(days));
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.products.timeline(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto, @Headers('x-actor-name') actor?: string) {
    return this.products.create({ ...dto, actorName: dto.actorName ?? actor });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.products.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  @Roles('OWNER', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.products.remove(id, actor ?? 'Admin');
  }

  /*  THE REVERSIBLE ONE WAS GUARDED AND THESE TWO WERE NOT (12 Sep 2026).
      `remove()` - a soft delete anybody could undo from the Trash screen -
      required OWNER or MANAGER, while bringing a product back to life and
      destroying it forever were open to every signed-in account. Restore puts
      a product in front of customers again with its old price; purge cannot be
      undone at all. They are guarded at least as strictly as the delete they
      reverse or finish.  */
  @Roles('OWNER', 'MANAGER')
  @Post(':id/restore')
  restore(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.products.restore(id, actor ?? 'Admin');
  }

  /** permanent — only from recovery, only when no order has ever sold it */
  @Roles('OWNER')
  @Delete(':id/permanent')
  purge(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.products.purge(id, actor ?? 'Admin');
  }
}
