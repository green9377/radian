import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService], // OrdersService consumes the quote engine (OFR-R10)
})
export class OffersModule {}
