import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit.service';
import { StorefrontCacheService } from './storefront-cache.service';
import { StorefrontCacheInterceptor } from './storefront-cache.interceptor';
import { PaymentMethodsService } from './payment-methods.service';

/**
 * CommonModule — the cross-cutting services every module may inject.
 * PrismaModule is @Global, so these can take PrismaService themselves.
 *
 * DEC-WEB-004 — StorefrontCacheInterceptor is global: after every successful
 * write it tells the shop that its cached pages are stale.
 *
 * DEC-GBL-001 — PaymentMethodsService lives here for the same reason: the
 * shop's payment list belongs to no single module, and POS, Purchases,
 * Suppliers and Returns all have to read the same answer.
 */
@Global()
@Module({
  providers: [
    AuditService,
    PaymentMethodsService,
    StorefrontCacheService,
    { provide: APP_INTERCEPTOR, useClass: StorefrontCacheInterceptor },
  ],
  exports: [AuditService, PaymentMethodsService, StorefrontCacheService],
})
export class CommonModule {}
