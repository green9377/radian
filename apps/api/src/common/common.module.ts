import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit.service';
import { StorefrontCacheService } from './storefront-cache.service';
import { StorefrontCacheInterceptor } from './storefront-cache.interceptor';

/**
 * CommonModule — cross-cutting service (AuditService) সব module-এ inject-যোগ্য।
 * PrismaModule @Global, তাই AuditService PrismaService inject করতে পারে。
 *
 * DEC-WEB-004 — StorefrontCacheInterceptor global: প্রতিটা সফল write-এর পর
 * দোকানকে খবর দেয় যে তার জমানো পাতা পুরনো হয়ে গেছে。
 */
@Global()
@Module({
  providers: [
    AuditService,
    StorefrontCacheService,
    { provide: APP_INTERCEPTOR, useClass: StorefrontCacheInterceptor },
  ],
  exports: [AuditService, StorefrontCacheService],
})
export class CommonModule {}
