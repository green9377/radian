import { Module } from '@nestjs/common';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';

/** Item Management — Master Data. RADIAN_ITEM_MODULE_ARCHITECTURE.md */
@Module({
  providers: [ItemsService],
  controllers: [ItemsController],
  exports: [ItemsService],
})
export class ItemsModule {}
