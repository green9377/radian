import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { AccessService } from './access.service';
import { REGISTRY } from './registry.def';

/**
 * AccessGuard — §৭ ধাপ ২, the SILENT stage. It blocks nobody.
 *
 * Why a stage that does nothing. 346 of the API's 419 routes have no role check
 * at all. Switching them on together and seeing what breaks means the thing
 * that breaks is the shop, with a customer standing at the counter. So this
 * runs the real verdict against real traffic and only WRITES DOWN who it would
 * have turned away. When that list stops filling up, enforcement is safe — and
 * not one day earlier.
 *
 * Module level only, on purpose. The node comes from the first path segment:
 * `GET /finance/pnl` asks about `finance`. That needs no annotation on 419
 * routes, so there is nothing to forget to add. Screen-level checks come later
 * and only where they earn their keep.
 *
 * ⚠️ It is a CanActivate that always returns true. That is not an oversight,
 * and the day it starts refusing must be a deliberate, separate change.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  private readonly logger = new Logger(AccessGuard.name);

  /** every node key, so an alias may point at a screen and not only a module */
  private readonly nodeKeys = new Set(REGISTRY.map((n) => n.key));

  /*  Never judged, for reasons that would each be a bug:
        auth   — sign-in and password reset must work BEFORE anyone has access
        administration — the screen that fixes access cannot need access to fix
        audit  — read-only and already @Roles('OWNER') on the whole controller
        health/root    — no session at all  */
  private static readonly NEVER = new Set([
    'auth', 'administration', 'audit', 'health', '',
  ]);

  /*  ⚠️ WHERE THE API PATH AND THE MENU PATH DISAGREE — 30 Jul 2026, review.
   *
   *  The node is normally the first path segment, which works because the panel
   *  and the API mostly share names. They do NOT always:
   *
   *      API /hr/*      panel /employees        -> key "employees"
   *      API /offers/*  panel /marketing/offers -> key "marketing.offers"
   *      API /seo/*     panel /marketing/seo    -> key "marketing.seo"
   *
   *  Without this map those three were silently NOT JUDGED AT ALL. The guard
   *  looked up "hr", found no such node, and waved every request through — so
   *  the silent stage would have reported a clean sheet for payroll, discounts
   *  and SEO while never once having checked them. A guard that quietly skips
   *  what it cannot name is worse than one that is plainly off, because the
   *  empty report is read as proof.
   *
   *  Measured after the fix: 17 of 20 API prefixes are judged, and the other
   *  three are in NEVER above, on purpose.
   */
  private static readonly PATH_TO_NODE: Record<string, string> = {
    hr: 'employees',
    offers: 'marketing.offers',
    seo: 'marketing.seo',
  };

  /** the last 200 near-misses, newest last. In memory: this is a working note,
      not evidence, and it must not grow without bound on a shop laptop. */
  private readonly seen: {
    at: string; who: string; position: string | null;
    method: string; path: string; node: string;
  }[] = [];

  /** path prefixes with no node — warned about once each, and reported */
  private readonly unmapped = new Set<string>();

  constructor(private readonly access: AccessService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    try {
      const req = ctx.switchToHttp().getRequest<Request & {
        actor?: { id: string; name: string; role: string };
      }>();
      const actor = req.actor;
      if (!actor) return true; // not signed in — AuthGuard already had its say

      const path = (req.path || req.url || '').split('?')[0];
      const first = path.replace(/^\//, '').split('/')[0];
      if (AccessGuard.NEVER.has(first)) return true;

      const node = AccessGuard.PATH_TO_NODE[first] ?? first;
      /*  Still nothing? Then it is genuinely unmapped, and that is worth SAYING
          rather than waving through in silence — an unjudged route is a hole in
          the report that stage 3 would inherit.  */
      if (!this.nodeKeys.has(node)) {
        if (!this.unmapped.has(first)) {
          this.unmapped.add(first);
          this.logger.warn(
            `no registry node for "/${first}" — every request under it is UNJUDGED. ` +
            'Add it to PATH_TO_NODE before enforcement is switched on.',
          );
        }
        return true;
      }

      const map = await this.access.effectiveFor(actor.id);
      if (map[node] !== false) return true;

      this.note({
        at: new Date().toISOString(),
        who: actor.name,
        position: actor.role ?? null,
        method: req.method,
        path,
        node,
      });
      this.logger.warn(
        `WOULD BLOCK ${actor.name} → ${req.method} ${path} (node "${first}")`,
      );
    } catch (e) {
      // a guard that can fail closed on its own bug would be the worst outcome
      this.logger.error(`access guard error — ${(e as Error).message}`);
    }
    return true;
  }

  private note(row: (typeof this.seen)[number]) {
    // one row per person+route, so a page that polls cannot bury everything else
    const dup = this.seen.findIndex(
      (s) => s.who === row.who && s.method === row.method && s.path === row.path,
    );
    if (dup >= 0) this.seen.splice(dup, 1);
    this.seen.push(row);
    if (this.seen.length > 200) this.seen.shift();
  }

  /** newest first, for the screen */
  report() {
    return [...this.seen].reverse();
  }

  /**
   * Path prefixes the guard could not name, and therefore never checked.
   *
   * This has to be visible. An empty "would block" list means one of two very
   * different things — either the ticks match reality, or the guard was not
   * looking. Without this the two are indistinguishable, and stage 3 would be
   * switched on off the back of a report about routes nobody examined.
   */
  unjudged() {
    return [...this.unmapped].sort();
  }
}
