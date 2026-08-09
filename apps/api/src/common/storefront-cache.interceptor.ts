import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';

import { StorefrontCacheService } from './storefront-cache.service';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DEC-WEB-004 — ONE place decides when the shop's cache is stale
 *
 *  ⚠️ Why an interceptor and not a call inside each service. There are more
 *  than twenty modules that can change something the shop displays. Adding a
 *  line to each would mean the twenty-first forgets, and the owner is back to
 *  "why has it not changed" with no clue which save is the odd one out. Here
 *  it is one rule, applied to every write, and a new module is covered on the
 *  day it is written.
 *
 *  ⚠️ Only after the handler SUCCEEDS (`tap` on next, not on error). A rejected
 *  save changed nothing, and rebuilding the shop for it would be work done for
 *  no reason.
 *
 *  ⚠️ Reads are ignored, and so are paths that cannot reach a public page —
 *  orders, POS, finance, inbox all move constantly and none of them is on the
 *  storefront. Left in, an ordinary trading day would rebuild the catalogue
 *  every few seconds.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const WRITE = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** paths whose writes never change a public page */
const NOT_PUBLIC = [
  '/orders',
  '/pos',
  '/finance',
  '/inbox',
  '/auth',
  '/administration',
  '/audit',
  '/hr',
  '/purchases',
  '/returns',
  '/delivery/runs',
  '/customers',
];

@Injectable()
export class StorefrontCacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: StorefrontCacheService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const path = (req.path || req.url || '').toLowerCase();
    const shouldPurge =
      WRITE.has(req.method) && !NOT_PUBLIC.some((p) => path.startsWith(p));

    return next
      .handle()
      .pipe(tap(() => shouldPurge && this.cache.purge(`${req.method} ${path}`)));
  }
}
