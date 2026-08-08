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

  // NOTE: static route must stay ABOVE ':id', otherwise Nest treats
  // "analytics" as an id.
  @Get('analytics')
  analytics(@Query('days') days?: string) {
    return this.products.analytics(parseInt(days ?? '30', 10) || 30);
  }

  // static route — must also stay ABOVE ':id'
  @Get('trash')
  trash() {
    return this.products.trash();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  @Get(':id/analytics')
  productAnalytics(@Param('id') id: string, @Query('days') days?: string) {
    return this.products.productAnalytics(id, parseInt(days ?? '30', 10) || 30);
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

  @Post(':id/restore')
  restore(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.products.restore(id, actor ?? 'Admin');
  }

  /** permanent — only from recovery, only when no order has ever sold it */
  @Delete(':id/permanent')
  purge(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.products.purge(id, actor ?? 'Admin');
  }
}
