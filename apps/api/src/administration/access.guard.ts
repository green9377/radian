import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { AccessService } from './access.service';
import { REGISTRY } from './registry.def';

/**
 * AccessGuard — §৭ stage 3: ENFORCING, by the owner's order, 18 Aug 2026.
 *
 * The silent stage ended the day it proved its point. An account invited
 * with no template signed in and every unguarded module worked (the rajib
 * incident) — "amn joto futa thakbe sob khuje ber kre futa off krba." So
 * the guard now refuses: a request into a module the template does not open
 * gets 403, in plain words.
 *
 * What made the flip safe, in order:
 *   · drift check green — every API prefix is judged, aliased or exempt,
 *     so nothing is waved through unexamined
 *   · effectiveFor answers all-false for a template-less account (the
 *     legacy bridge is retired) and all-true for OWNER
 *   · invites require a template, so no new account is born undecided
 *
 * Module level only, on purpose. The node comes from the first path segment:
 * `GET /finance/pnl` asks about `finance`. Screen-level checks come later
 * and only where they earn their keep. The @Roles decorators stay as a
 * second, independent wall until they are retired deliberately.
 *
 * The report survives: what used to be "would block" is now the log of what
 * WAS blocked, on the same screen. Unmapped prefixes still pass — but the
 * drift check fails the build if one appears, so that state cannot persist.
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
    /*  shop — the customer browser calls this, every route @Public(). There is
        no actor to judge, so judging it would mean inventing one. Added 17 Aug
        2026: it had been neither node, alias nor exempt, which is the
        "silently not judged" hole this list exists to close.

        ⚠️ NO APOSTROPHES IN THIS COMMENT. registry.drift.mjs reads this set by
        regex, pairing single quotes — one apostrophe in prose shifts every
        pair after it and three exempt prefixes report as UNJUDGED. Cost half
        an hour on the day it was written.  */
    'auth', 'administration', 'audit', 'health', 'shop', '',
    /*  media - the shared upload room. Every modules editor posts images
        here (products, banners, brands, categories, reviews). Judging it by
        one module would break uploads for every other allowed module, and
        an uploaded file on its own changes no business row - the save that
        USES the url is judged at its own modules prefix.  */
    'media',
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
    /*  API /messaging/*  panel /marketing/messaging  -> key "marketing.messaging"
        Settings, templates and the send queue — WhatsApp/SMS wiring, all of it
        OWNER or MANAGER on the controller. It was in neither list, so the guard
        looked up "messaging", found nothing and waved it through: the one
        prefix where a wrong hand can start sending real messages that cost real
        money. Found by the drift check on 17 Aug 2026, which is what it is for. */
    messaging: 'marketing.messaging',
    /*  Found UNJUDGED in the live logs, 19 Aug 2026 - twenty-five prefixes
        the guard could not name, because the drift check only read files
        named *.controller.ts while most controllers live in files like
        catalog/addons.ts. Every alias below points at the module or screen
        whose panel page actually edits that data, read off the admin routes
        - not at the folder name.  */
    'item-attributes': 'items',
    'item-categories': 'items',
    'item-types': 'items',
    units: 'items',
    addons: 'products.addons',
    capacity: 'products.capacity',
    'variant-attributes': 'products.variants',
    'variant-groups': 'products.variants',
    bundles: 'products.upgrades',
    'craft-points': 'products',
    'tag-groups': 'tags',
    'category-story': 'categories',
    /*  DEC-PRD-044 — the nature master is edited from inside the product form,
        so whoever may edit a product may keep the list.  */
    nature: 'products',
    channels: 'orders',
    segments: 'customers',
    banners: 'storefront',
    collections: 'storefront',
    content: 'storefront',
    footer: 'storefront',
    'page-sections': 'storefront',
    sections: 'storefront',
    'shop-hours': 'storefront',
    'trust-badges': 'storefront',
    reviews: 'storefront.reviews',
    webhooks: 'marketing.messaging',
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
        `BLOCKED ${actor.name} → ${req.method} ${path} (node "${node}")`,
      );
      throw new ForbiddenException(
        'Your access template does not open this part of the system — ask the owner',
      );
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      /*  The guard's OWN failure (a DB hiccup, a bug here) still fails open,
          with a loud error — locking the whole shop out because the lock
          itself broke would be the worse outcome, and the @Roles wall and
          module-level checks still stand underneath.  */
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
