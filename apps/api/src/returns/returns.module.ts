import { Module } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { FinanceModule } from '../finance/finance.module';

/**
 * Returns & Refunds — RADIAN_RETURNS_MODULE_ARCHITECTURE.md (locked 23 Jul 2026).
 * Owns Return/Refund entities (DEC-RTN-001..004). Restock flows through
 * InventoryService (INV-RULE-001) — never writes stock tables directly.
 * Refund payout is capped at what was actually collected (Sales review #1).
 */
@Module({
  imports: [InventoryModule, FinanceModule],
  providers: [ReturnsService],
  controllers: [ReturnsController],
})
export class ReturnsModule {}
