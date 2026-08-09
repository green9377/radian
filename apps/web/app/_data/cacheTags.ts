/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DEC-WEB-004 — one tag for everything the shop reads from the API
 *
 *  Owner, 9 Aug 2026: *"admin-e kichu change krle frontend aste aste onk time
 *  lage proay 1 mnt lege jay ba tar o upore, amn kn hocche?"*
 *
 *  ⚠️ Why it was slow. Every public page is cached for 60 seconds (5 Aug — the
 *  free Render API is slow enough that fetching per page-view made the shop
 *  crawl). On top of that Next serves the STALE page to whoever arrives first
 *  after those 60s and rebuilds in the background — so a change took one to two
 *  minutes and usually two reloads.
 *
 *  The 60 seconds is now only a safety net. The real trigger is the save: the
 *  API pings `/api/revalidate` and that page is rebuilt at once.
 *
 *  ⚠️ ONE TAG, not one per product — deliberately. Pages mix sources (a product
 *  page carries its category's badges, its bundles, its add-ons), so a tag per
 *  product would leave the other three stale and we would be back to "why has
 *  it not changed". Rebuilding the public catalogue is cheap; being subtly
 *  wrong is not.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const SHOP_TAG = "shop";
