import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryAnalyticsService } from './delivery-analytics.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { OrdersModule } from '../orders/orders.module';

/**
 * DEC-DLV-006 — Delivery drives Order.deliveryStatus THROUGH OrdersService so
 * the payment/COD/LTV/stock rules stay single-sourced. One-way dependency:
 * Delivery → Orders (Orders never imports Delivery — no cycle).
 */
@Module({
  imports: [PrismaModule, CommonModule, OrdersModule],
  controllers: [DeliveryController],
  providers: [DeliveryService, DeliveryAnalyticsService],
  /*  Exported so Intelligence can READ the delivery verdict rather than form
      its own. Two modules each working out "on-time %" is how a shop ends up
      with two answers to one question. */
  exports: [DeliveryAnalyticsService],
})
export class DeliveryModule {}
