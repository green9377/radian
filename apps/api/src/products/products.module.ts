import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';

@Module({
  providers: [ProductsService],
  controllers: [ProductsController],
  /*  Exported 29 Jul so the Intelligence Products lens can ASK for the product
      figures instead of working out its own — the rule that keeps one number
      to one owner (INT-R01). */
  exports: [ProductsService],
})
export class ProductsModule {}
