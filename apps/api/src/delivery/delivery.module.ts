import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryAnalyticsService } from './delivery-analytics.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { OrdersModule } from '../orders/orders.module';
import { FinanceModule } from '../finance/finance.module';

/**
 * DEC-DLV-006 — Delivery drives Order.deliveryStatus THROUGH OrdersService so
 * the payment/COD/LTV/stock rules stay single-sourced. One-way dependency:
 * Delivery → Orders (Orders never imports Delivery — no cycle).
 *
 * DEC-DLV-017 — and Delivery → Finance, for the same reason in the same
 * direction: settling a carrier is a delivery event, but what it means in the
 * accounts belongs to Finance. Finance imports neither Orders nor Delivery, so
 * this stays a one-way street.
 */
@Module({
  imports: [PrismaModule, CommonModule, OrdersModule, FinanceModule],
  controllers: [DeliveryController],
  providers: [DeliveryService, DeliveryAnalyticsService],
  /*  Exported so Intelligence can READ the delivery verdict rather than form
      its own. Two modules each working out "on-time %" is how a shop ends up
      with two answers to one question. */
  exports: [DeliveryAnalyticsService],
})
export class DeliveryModule {}
