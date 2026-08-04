import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global — সব module PrismaService inject করতে পারবে আলাদা import ছাড়াই।
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
