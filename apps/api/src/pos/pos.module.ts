import { Module } from '@nestjs/common';
import { PosService } from './pos.service';
import { PosController } from './pos.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { FinanceModule } from '../finance/finance.module';

/*
  POS — physical-store counter (RADIAN_POS_MODULE_ARCHITECTURE.md, locked 23 Jul).
  Sales land in the unified Order ledger (channel=POS, DEC-POS-001); stock deducts
  through InventoryService only (INV-RULE-001), so this module imports InventoryModule.
*/
@Module({
  imports: [InventoryModule, FinanceModule],
  providers: [PosService],
  controllers: [PosController],
})
export class PosModule {}
