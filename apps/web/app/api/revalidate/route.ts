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
 *  What the open door actually costs. Expiring a tag rebuilds nothing by
 *  itself — the next visitor does, and they were going to be served a page
 *  anyway. So an abuser calling this in a loop achieves a cold cache, which is
 *  the `no-store` the shop ran on until 5 Aug: slower, more calls to a free
 *  API, but nothing exposed and nothing broken.
 *
 *  ⚠️ AND THE THROTTLE IS WEAKER THAN IT LOOKS. `lastOpenCall` lives in one
 *  serverless instance's memory; Vercel runs several, so the real ceiling is
 *  20 seconds PER INSTANCE, not per shop. Verified 9 Aug 2026 — two calls
 *  eight seconds apart were both accepted. It is a speed bump, not a lock.
 *  Before the real shop goes live, set REVALIDATE_SECRET on both sides and
 *  this branch stops being reachable (RADIAN_PENDING).
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
