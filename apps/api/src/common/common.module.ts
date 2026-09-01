import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit.service';
import { StorefrontCacheService } from './storefront-cache.service';
import { StorefrontCacheInterceptor } from './storefront-cache.interceptor';
import { PaymentMethodsService } from './payment-methods.service';
import { OutboundGuard, OutboundGuardController } from './outbound-guard';

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
 *
 * OutboundGuard is here because it is global by nature: three different
 * modules own the three doors a message can leave by, and each has to reach
 * the same rules. Being in a @Global module means a new door inherits it by
 * injecting it, without a module edit anyone can forget.
 */
@Global()
@Module({
  providers: [
    AuditService,
    OutboundGuard,
    PaymentMethodsService,
    StorefrontCacheService,
    { provide: APP_INTERCEPTOR, useClass: StorefrontCacheInterceptor },
  ],
  controllers: [OutboundGuardController],
  exports: [AuditService, OutboundGuard, PaymentMethodsService, StorefrontCacheService],
})
export class CommonModule {}
