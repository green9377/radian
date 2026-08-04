import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * CommonModule — cross-cutting service (AuditService) সব module-এ inject-যোগ্য।
 * PrismaModule @Global, তাই AuditService PrismaService inject করতে পারে।
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class CommonModule {}
