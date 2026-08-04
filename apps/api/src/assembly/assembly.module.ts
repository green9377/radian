import { Module } from '@nestjs/common';
import { AssemblyController } from './assembly.controller';
import { AssemblyService } from './assembly.service';
import { InventoryModule } from '../inventory/inventory.module';
import { ItemsModule } from '../items/items.module';

/** Assembly — RADIAN_ASSEMBLY_MODULE_ARCHITECTURE.md (locked 22 Jul 2026).
 *  Consumer of InventoryService (ASM-RULE-002) — never writes stock itself. */
@Module({
  imports: [InventoryModule, ItemsModule],
  controllers: [AssemblyController],
  providers: [AssemblyService],
})
export class AssemblyModule {}
