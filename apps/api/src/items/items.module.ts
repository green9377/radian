import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';

/** Item Management — Master Data. RADIAN_ITEM_MODULE_ARCHITECTURE.md */
@Module({
  imports: [InventoryModule], // DEC-ITM-026 - unit restatement goes through THE stock writer
  providers: [ItemsService],
  controllers: [ItemsController],
  exports: [ItemsService],
})
export class ItemsModule {}
