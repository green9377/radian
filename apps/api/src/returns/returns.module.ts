import { Module } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { FinanceModule } from '../finance/finance.module';
/*  DEC-FIN-031 — the gateway refund lives in the payment module, which owns
    every call to SSLCommerz. Returns borrows it; it does not talk to the
    gateway itself, or there would be two places that know how.  */
import { PaymentModule } from '../shop/payment';

/**
 * Returns & Refunds — RADIAN_RETURNS_MODULE_ARCHITECTURE.md (locked 23 Jul 2026).
 * Owns Return/Refund entities (DEC-RTN-001..004). Restock flows through
 * InventoryService (INV-RULE-001) — never writes stock tables directly.
 * Refund payout is capped at what was actually collected (Sales review #1).
 */
@Module({
  imports: [InventoryModule, FinanceModule, PaymentModule],
  providers: [ReturnsService],
  controllers: [ReturnsController],
})
export class ReturnsModule {}
