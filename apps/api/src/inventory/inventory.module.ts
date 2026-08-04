import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { FinanceModule } from '../finance/finance.module';

/**
 * Inventory — RADIAN_INVENTORY_MODULE_ARCHITECTURE.md (locked 22 Jul 2026).
 * THE single owner of stock (DEC-ITM-005). Exports InventoryService so
 * Purchase (receive events, DEC-PUR-002) and Delivery (DEC-INV-015 repoint)
 * post movements through it — never by writing stock tables themselves
 * (INV-RULE-001).
 */
@Module({
  imports: [FinanceModule],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
