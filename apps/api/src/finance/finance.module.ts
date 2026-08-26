import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceEventsService } from './finance-events.service';
import { FinanceAssetsService } from './finance-assets.service';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceDriftService } from './finance-drift.service';
import { FinanceMushakService } from './finance-mushak.service';
import { FinanceGatewayService } from './finance-gateway.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';

/*  Finance owns the ledger and consumes completed events from the operational
    modules. It exports FinanceService so Orders/POS/Purchase/Returns/Inventory/
    Delivery can call postEvent() fail-soft (DEC-FIN-010) — one-way dependency,
    exactly like the Inventory mirror. Finance never imports those services. */
@Module({
  imports: [PrismaModule, CommonModule, AuthModule],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceEventsService, FinanceAssetsService, FinanceReportsService, FinanceDriftService, FinanceMushakService, FinanceGatewayService],
  exports: [FinanceService, FinanceEventsService, FinanceAssetsService, FinanceReportsService, FinanceDriftService, FinanceMushakService, FinanceGatewayService],
})
export class FinanceModule {}
