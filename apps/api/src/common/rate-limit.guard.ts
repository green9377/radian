import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

/*
  ═══════════════════════════════════════════════════════════════════════════
  RATE LIMIT — S-02, 31 Aug 2026.

  The audit found no limit of any kind on the API. Unlimited attempts were
  available on the login box, on order tracking, on the forgot-password box and
  on two upload routes that need no account at all and write straight to the
  VPS disk.

  ── WHY THIS IS SIXTY LINES AND NOT A DEPENDENCY ────────────────────────────
  @nestjs/throttler is the obvious answer and it was considered properly. It
  was not taken, for reasons that are about THIS deployment and not about the
  package:

   · There is one API container. Throttler's default store is in-process
     memory, exactly like this one, so the package buys no correctness here -
     only the same semantics with a lockfile entry, a global APP_GUARD to opt
     routes out of, and a version to keep up with.
   · This API has six runtime dependencies on purpose. Every added one is a
     rebuild that can fail on a day nobody planned to debug a build.
   · The X-Forwarded-For handling below is needed either way. It is most of
     the work, and the package does not do it for us.

  ⚠️ IF THE API IS EVER RUN AS MORE THAN ONE CONTAINER, THIS BECOMES WRONG -
  each instance would count separately and the real limit multiplies by the
  number of instances. That is the day to move the counter into Postgres or
  Redis, and the day this comment exists for.

  ── FAIL-OPEN, ALWAYS ───────────────────────────────────────────────────────
  A rate limiter that breaks must let traffic through, never hold it back. A
  shop that stops selling because a counter had a bad day is a worse outcome
  than the attack this defends against.
  ═══════════════════════════════════════════════════════════════════════════
*/

export interface RateLimitRule {
  /** how many requests are allowed inside the window */
  limit: number;
  /** the window, in seconds */
  windowSec: number;
  /**
   * Buckets are per route by default. Give two routes the same `bucket` to
   * make them share one allowance.
   */
  bucket?: string;
}

export const RATE_LIMIT = 'radian:rateLimit';
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT, rule);

/*
  A ceiling on how many buckets are held at once. Without it, somebody cycling
  through addresses would grow this map until the container runs out of memory
  - turning a defence into the very thing it defends against.
*/
const MAX_KEYS = 20_000;

interface Window {
  count: number;
  /** epoch ms when this window ends and the count resets */
  resetAt: number;
}

/*
  ⚠️ MODULE SCOPE, NOT A FIELD ON THE GUARD — AND IT HAS TO BE.

  `@UseGuards(RateLimitGuard)` hands Nest a CLASS, and Nest builds one instance
  per module that asks for it. CheckoutController and PaymentController live in
  different modules, so they hold different guard objects. With the counter as
  an instance field, the 'order-lookup' bucket those two deliberately share
  would quietly become two separate counters and the shared allowance would be
  double what `rate-limits.ts` says.

  Nothing would look wrong. The limit would simply be twice the number written
  down, which is the worst kind of bug in a file like this.
*/
const HITS = new Map<string, Window>();
let lastSweep = Date.now();

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly log = new Logger('RateLimit');

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<RateLimitRule>(RATE_LIMIT, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!rule) return true;

    try {
      const req = ctx.switchToHttp().getRequest<Request>();
      const who = clientIp(req);
      const bucket =
        rule.bucket ?? `${ctx.getClass().name}.${ctx.getHandler().name}`;
      const key = `${bucket}|${who}`;
      const now = Date.now();

      sweep(now);

      const found = HITS.get(key);
      if (!found || found.resetAt <= now) {
        /*  Over the ceiling: stop COUNTING rather than stop SERVING. The
            existing buckets keep working, so whoever is already being limited
            still is.  */
        if (!found && HITS.size >= MAX_KEYS) return true;
        HITS.set(key, { count: 1, resetAt: now + rule.windowSec * 1000 });
        return true;
      }

      found.count += 1;
      if (found.count > rule.limit) {
        const retryAfter = Math.max(1, Math.ceil((found.resetAt - now) / 1000));
        /*  Logged once as it crosses, not on every refused request - an attack
            would otherwise write the log file until the disk is full.  */
        if (found.count === rule.limit + 1)
          this.log.warn(
            `limit hit: ${bucket} from ${who} (${rule.limit}/${rule.windowSec}s)`,
          );

        /*  The message a CUSTOMER can act on. It never says what the limit is
            or how long the window really is - that is a map for whoever is
            probing. Retry-After carries the honest number for real clients.  */
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many attempts. Please wait a moment and try again.',
            retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (e) {
      // The refusal above is a real answer and must travel. Anything else is a
      // fault in the counter, and a fault in the counter must not close the shop.
      if (e instanceof HttpException) throw e;
      this.log.error(
        `rate limit skipped after an internal error: ${String(e)}`,
      );
      return true;
    }
  }
}

/** Drop finished windows. Cheap, and only every 60 seconds. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, w] of HITS) if (w.resetAt <= now) HITS.delete(k);
}

/** Test seam only — lets a spec start from a clean slate. */
export function __resetRateLimits() {
  HITS.clear();
  lastSweep = Date.now();
}

/*
  WHO IS ASKING — and the one line that decides whether this whole file works.

  ⚠️ EVERY REQUEST ARRIVES FROM CADDY. Read `req.ip` and every visitor in the
  world shares the proxy container's address, one bucket holds the entire
  shop's traffic, and the first busy hour locks out every real customer. That
  is not a smaller version of working; it is the shop closing itself.

  Caddy APPENDS the address it is talking to onto X-Forwarded-For. So the LAST
  entry is the real peer, and it is the only entry that cannot be faked: a
  client sending `X-Forwarded-For: 1.2.3.4` arrives here as
  `1.2.3.4, <their real address>`. Reading the FIRST entry - the usual
  instinct, and what most examples show - would hand an attacker a fresh
  identity per request just by changing a header.

  No X-Forwarded-For means nothing is in front of us (local dev, or a direct
  call inside the docker network), so the socket address is the truth.

  ⚠️ Mobile Bangladesh is behind carrier NAT, so thousands of real customers
  legitimately share one address. That is why the storefront limits in
  `rate-limits.ts` are generous and the admin ones are strict - see the note
  there before changing any number.
*/
function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const chain = Array.isArray(xff) ? xff.join(',') : xff;
  if (chain) {
    const parts = chain
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
