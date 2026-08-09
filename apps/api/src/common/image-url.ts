/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DEC-PRD-033 — an image column holds an ADDRESS, never CSS
 *
 *  Owner, 9 Aug 2026: *"add-on add korsi, product page-e add-on show korleo
 *  image ase na."*
 *
 *  ⚠️ Why this exists. The admin's add-on card carried a CSS background (a
 *  gradient OR a picture) and wrote it straight into `AddOn.imageUrl`, so
 *  rows were saved as `url(https://…) center/cover`. The storefront then
 *  wrapped that in url() a second time and the tile rendered blank — the
 *  add-on was listed, the photo never came.
 *
 *  The admin now writes a bare address. This unwraps the rows saved before
 *  that fix, so old data heals on read instead of needing a migration and
 *  a re-upload of every photo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `url(https://x) center/cover` → `https://x`. A plain address passes through.
 *  A gradient — or anything that is not an address — becomes `null`, because a
 *  style is not a picture and the page must fall back to its own tile. */
export function bareImageUrl(css: string | null | undefined): string | null {
  if (!css) return null;
  const s = css.trim();
  const m = /^url\(\s*['"]?(.+?)['"]?\s*\)/.exec(s);
  if (m) return m[1];
  return /^https?:\/\//i.test(s) ? s : null;
}
