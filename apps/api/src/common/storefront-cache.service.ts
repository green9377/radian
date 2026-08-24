import { Injectable, Logger } from '@nestjs/common';

import { storefrontOrigins } from './web-origins';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DEC-WEB-004 — tell the shop its pages are out of date
 *
 *  Owner, 9 Aug 2026: *"admin-e kichu change krle frontend aste aste onk time
 *  lage, proay 1 mnt ba tar o upore."*
 *
 *  The shop caches every public page for 60 seconds so the free API is not hit
 *  on every page-view (5 Aug), and Next then serves the stale copy to whoever
 *  arrives first after that. Result: a minute or two, and two reloads.
 *
 *  So after a catalogue write, this knocks on the shop's `/api/revalidate` and
 *  the page rebuilds at once. The 60 seconds stays as the safety net for
 *  anything that forgets to knock.
 *
 *  ⚠️ FIRE AND FORGET, ALWAYS. A save must never fail — or even wait — because
 *  a cache ping did. Every failure is a log line and nothing more; the 60-second
 *  net still catches it.
 *
 *  ⚠️ Silent when unconfigured. Local dev has no storefront URL and no secret,
 *  and a warning on every save would train everyone to ignore warnings.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class StorefrontCacheService {
  private readonly log = new Logger('StorefrontCache');
  /*  Several writes usually land together (save a product → its images, its
      variants, its tags). One ping covers them all, so they are coalesced
      into a single call a moment later instead of four.  */
  private pending: NodeJS.Timeout | null = null;

  purge(reason = 'catalogue changed') {
    /*  ⚠️ EVERY ADDRESS WE OWN, NOT ONE ENV VAR — 24 August 2026.

        This read `PUBLIC_WEB_URL` alone and gave up silently when it was
        missing. On the demo it was not missing; it was WRONG, and so every
        single ping had been coming back 404 — every product save, every
        offer, since the day this was written. Nothing looked broken, because
        CORS has its own hard-coded fallback and therefore kept working.

        Found by creating four real offers and watching a product page not
        change. `storefrontOrigins()` now carries the same fallback CORS has
        had all along, and the two lists are one list.  */
    const bases = storefrontOrigins();
    if (bases.length === 0) return;
    /*  Optional. Set on both sides → the shop trusts the call outright.
        Unset → the shop still accepts it, but throttled (see the route), so
        this works with no configuration at all.  */
    const secret = process.env.REVALIDATE_SECRET;

    if (this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      void (async () => {
        const failed: string[] = [];
        for (const base of bases) {
          try {
            const r = await fetch(`${base}/api/revalidate`, {
              method: 'POST',
              headers: secret ? { 'x-revalidate-secret': secret } : {},
            });
            /*  One good answer is enough — the rest are the same shop under
                another name, or an address that is not ours any more.  */
            if (r.ok) return;
            failed.push(`${base} → ${r.status}`);
          } catch (e: unknown) {
            failed.push(`${base} → ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        /*  ⚠️ ERROR, not warn. When this fails the shop stops refreshing
            after a save, which is invisible from every screen and reads to
            the owner as "the admin does not work". A warning in a log nobody
            opens is how it hid for a fortnight.  */
        this.log.error(
          `storefront never refreshed after ${reason} — tried ${failed.join(', ')}`,
        );
      })();
    }, 400);
    /*  ⚠️ unref so a pending ping never holds the process open on shutdown  */
    this.pending.unref?.();
  }
}
