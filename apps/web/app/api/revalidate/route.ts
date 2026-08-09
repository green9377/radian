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
 *  ⚠️ GUARDED BY A SHARED SECRET. Without one, anyone on the internet could
 *  hold the shop's cache open by calling this in a loop, which on a free API
 *  plan is a bill and a slow shop. No secret configured = the door is bolted
 *  shut (503), never left open — a missing setting must fail closed.
 *
 *  ⚠️ Returns 200 even when it changed nothing. This is a hint, not a
 *  transaction: the API must never fail a save because a cache ping did.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(req: Request) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, reason: "not configured" }, { status: 503 });
  }

  const given =
    req.headers.get("x-revalidate-secret") ??
    new URL(req.url).searchParams.get("secret") ??
    "";
  if (given !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  /*  ⚠️ Next 16 wants the cache-life profile as a second argument — calling it
      with one is deprecated and warns. "max" expires every entry carrying the
      tag, which is what a save means: nothing cached about the catalogue is
      true any more.  */
  revalidateTag(SHOP_TAG, "max");
  return NextResponse.json({ ok: true, tag: SHOP_TAG, at: new Date().toISOString() });
}
