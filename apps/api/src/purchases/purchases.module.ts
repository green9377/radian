import { Module } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { ItemsModule } from '../items/items.module';
import { InventoryModule } from '../inventory/inventory.module';
import { FinanceModule } from '../finance/finance.module';

/**
 * Purchase — RADIAN_PURCHASE_MODULE_ARCHITECTURE.md (locked 22 Jul 2026).
 * Imports ItemsModule ONLY to push average-cost updates through Item's own
 * service (DEC-PUR-005 / One Data One Owner). Never writes stock (DEC-PUR-002) —
 * receive/return events go THROUGH InventoryService (DEC-INV-001, 22 Jul night).
 */
@Module({
  imports: [ItemsModule, InventoryModule, FinanceModule],
  providers: [PurchasesService],
  controllers: [PurchasesController],
  exports: [PurchasesService],
})
export class PurchasesModule {}
