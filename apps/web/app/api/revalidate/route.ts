import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { SHOP_TAG } from "../../_data/cacheTags";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DEC-WEB-004 — the door the API knocks on after a save
 *
 *  Owner, 9 Aug 2026: a change made in the admin took a minute or more to show
 *  in the shop, and usually two reloads. The 60-second cache is what made the
 *  shop fast on the free API (5 Aug); this is what makes it fresh as well.
 *
 *  The API calls this the moment a product, category, tag or page is written.
 *  The next visitor gets a rebuilt page — no waiting, no second reload.
 *
 *  ⚠️ THE SECRET IS OPTIONAL, AND THAT IS A DELIBERATE TRADE.
 *
 *  Set `REVALIDATE_SECRET` on both sides and the call is trusted outright.
 *  Leave it unset and the door still opens — but no more than once every 20
 *  seconds. Owner, 9 Aug 2026: he should not have to paste a secret into two
 *  dashboards to stop his own shop lagging, and a feature nobody configures
 *  is a feature that does not exist.
 *
 *  The throttle is what makes that safe. Expiring a tag does not rebuild
 *  anything by itself — the next visitor does, and they were going to be
 *  served a page anyway. So the worst an abuser achieves is a cache that
 *  behaves as if its life were 20 seconds instead of 60. Bounded, and still
 *  far cheaper than the `no-store` this replaced.
 *
 *  ⚠️ Returns 200 even when it changed nothing. This is a hint, not a
 *  transaction: the API must never fail a save because a cache ping did.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** last accepted unauthenticated call, per server instance */
let lastOpenCall = 0;
const OPEN_THROTTLE_MS = 20_000;

export async function POST(req: Request) {
  const expected = process.env.REVALIDATE_SECRET;

  if (expected) {
    const given =
      req.headers.get("x-revalidate-secret") ??
      new URL(req.url).searchParams.get("secret") ??
      "";
    if (given !== expected) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  } else {
    const now = Date.now();
    if (now - lastOpenCall < OPEN_THROTTLE_MS) {
      return NextResponse.json({ ok: true, skipped: "throttled" });
    }
    lastOpenCall = now;
  }

  /*  ⚠️ Next 16 wants the cache-life profile as a second argument — calling it
      with one is deprecated and warns. "max" expires every entry carrying the
      tag, which is what a save means: nothing cached about the catalogue is
      true any more.  */
  revalidateTag(SHOP_TAG, "max");
  return NextResponse.json({ ok: true, tag: SHOP_TAG, at: new Date().toISOString() });
}
