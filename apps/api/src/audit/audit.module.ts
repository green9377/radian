import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditReadService } from './audit-read.service';
import { PrismaModule } from '../prisma/prisma.module';

/*  AUDIT — Intelligence, not Operations.

    It owns no entity and writes nothing. It reads AuditLog and ActivityEvent,
    which every other module has been filling since the first screen was built
    and which nothing has ever read back.

    Note what is NOT imported: CommonModule, and therefore AuditService. This
    module cannot write to the trail even by accident. */
@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [AuditReadService],
  exports: [AuditReadService],
})
export class AuditModule {}
