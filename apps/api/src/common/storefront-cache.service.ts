import { Injectable, Logger } from '@nestjs/common';

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
    const base = process.env.WEB_PUBLIC_URL;
    const secret = process.env.REVALIDATE_SECRET;
    if (!base || !secret) return;

    if (this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      void fetch(`${base.replace(/\/$/, '')}/api/revalidate`, {
        method: 'POST',
        headers: { 'x-revalidate-secret': secret },
      })
        .then((r) => {
          if (!r.ok) this.log.warn(`revalidate → ${r.status} (${reason})`);
        })
        .catch((e: unknown) => {
          this.log.warn(`revalidate failed (${reason}): ${e instanceof Error ? e.message : e}`);
        });
    }, 400);
    /*  ⚠️ unref so a pending ping never holds the process open on shutdown  */
    this.pending.unref?.();
  }
}
