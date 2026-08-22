import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './soft-delete.extension';
import { clearBuriedKeysExtension } from './clear-buried-keys.extension';

/**
 * PrismaService — একমাত্র DB access point (One Data One Owner-এর technical base)।
 *
 * দুটো surface:
 *   this.prisma.db.*   → soft-delete-aware client (read-এ deletedAt: null auto-filter)।
 *                        সব module service এটাই ব্যবহার করবে।
 *   this.prisma.*      → base client (extension ছাড়া) — শুধু বিশেষ ক্ষেত্রে
 *                        (যেমন deleted রেকর্ডও দেখতে হলে) দরকার।
 *
 * hard DELETE কখনো নয় — delete = update({ deletedAt }) + audit, owning-module service-এ।
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /*  DEC-GBL-007 — `clearBuriedKeys` goes on TOP of soft-delete, and it is
      handed the RAW client on purpose: the row it has to find is the one
      soft-delete hides.  */
  readonly db = this.$extends(softDeleteExtension).$extends(
    clearBuriedKeysExtension(this),
  );

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
