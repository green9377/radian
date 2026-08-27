import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OnlinePaymentsService } from './online-payments.service';
import { OrdersController } from './orders.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { OffersModule } from '../offers/offers.module';
import { FinanceModule } from '../finance/finance.module';
import { CapacityModule } from '../catalog/capacity';
import { WhatsAppCloudModule } from '../common/whatsapp-cloud';
import { MessagingModule } from '../messaging/messaging.controller';
/*  DEC-PRD-050 — a delivered order re-ranks Best seller.  */
import { MerchModule } from '../products/merch';

/**
 * DEC-INV-015 stage 1 (22 Jul night): preparing/cancel post SALE movements to
 * Inventory IN PARALLEL with the legacy Product.stockQty write. Legacy stays
 * the enforcing copy until the owner verifies real orders match, then the flag
 * flips (stage 3) and Product.stockQty becomes derived read-only.
 */
@Module({
  imports: [InventoryModule, OffersModule, FinanceModule, CapacityModule, WhatsAppCloudModule, MessagingModule, MerchModule],
  providers: [OrdersService, OnlinePaymentsService],
  controllers: [OrdersController],
  exports: [OrdersService], // DeliveryModule drives transitions through this (DEC-DLV-006)
})
export class OrdersModule {}
