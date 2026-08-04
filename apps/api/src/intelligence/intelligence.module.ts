import { Module } from '@nestjs/common';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';
import { IntelligenceAutomationService } from './intelligence.automation';
import { IntelligenceKpiService } from './intelligence.kpi.service';
import { IntelligenceLensService } from './intelligence.lens.service';
import { IntelligenceReportsService } from './intelligence.reports.service';
import { IntelligenceForecastService } from './intelligence.forecast.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { FinanceModule } from '../finance/finance.module';
import { InventoryModule } from '../inventory/inventory.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { ProductsModule } from '../products/products.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { HrModule } from '../hr/hr.module';
import { MarketingModule } from '../marketing/marketing.module';

/*  INTELLIGENCE — RADIAN_INTELLIGENCE_MODULE_ARCHITECTURE.md (29 Jul 2026).

    Intelligence owns DailySnapshot, KpiTarget and IntelligenceSetting — and no
    business data whatsoever. It reads Order, Customer, DeliveryAssignment,
    InventoryStock and the ledger, and writes NONE of them. There is no write
    path out of this module except to its own three tables.

    The dependency runs one way, the same shape as HR and Marketing:
    Intelligence imports Finance and Inventory; neither ever imports
    Intelligence. Nothing downstream reads a KPI target, and nothing downstream
    may ever read a DailySnapshot — it is a cache of this module's own making,
    and a second module treating it as a source is exactly how a cache becomes a
    competing set of books.

    Nothing is exported, and that is the point. If another module ever needs a
    figure Intelligence shows, it must go to whoever OWNS that figure, not to
    the module that borrowed it. */
@Module({
  /*  Nine lenses means nine sources. Every one of these is a ONE-WAY import:
      Intelligence reads from them, none of them reads from Intelligence. That
      is what keeps this module a reader and not a second set of books. */
  imports: [
    PrismaModule, CommonModule,
    FinanceModule, InventoryModule, DeliveryModule, ProductsModule,
    PurchasesModule, SuppliersModule, HrModule, MarketingModule,
  ],
  controllers: [IntelligenceController],
  providers: [IntelligenceService, IntelligenceAutomationService, IntelligenceKpiService, IntelligenceLensService, IntelligenceReportsService, IntelligenceForecastService],
})
export class IntelligenceModule {}
