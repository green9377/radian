/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHERE THE SHOP AND THE ADMIN LIVE — one list, read by everything.
 *
 *  ⚠️ WHY THIS FILE EXISTS. It was written twice: `main.ts` built one list for
 *  CORS with a hard-coded demo fallback, and `StorefrontCacheService` read the
 *  bare `PUBLIC_WEB_URL` with no fallback at all. So on 24 August 2026 the two
 *  disagreed, and the disagreement was invisible:
 *
 *    · CORS worked, because the fallback carried it. The shop loaded, the
 *      admin loaded, everything looked healthy.
 *    · The cache ping went to whatever `PUBLIC_WEB_URL` held and came back
 *      404 on EVERY write — every product save, every offer, all of it. The
 *      log line said so a hundred times and nobody was reading the log.
 *
 *  The result was the owner's original complaint, still true a fortnight after
 *  it was "fixed" (DEC-WEB-004, 9 Aug): *"admin-e kichu change krle frontend
 *  aste aste onk time lage."* An offer created in the admin did not appear on
 *  a product page that had already been rendered, because the only thing left
 *  refreshing it was the 60-second net — and a net only catches a page
 *  somebody asks for.
 *
 *  The 4 August comment in `main.ts` had already named this trap: a Render env
 *  var can be missing or wrong and NOTHING looks broken, because the masked
 *  form shows a value either way. That is exactly why CORS was given a
 *  fallback. The cache ping never got one.
 *
 *  One list now. If a URL is good enough for CORS it is good enough to knock
 *  on, and the two can no longer drift.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const trim = (s: string) => s.trim().replace(/\/+$/, '');

/**
 * The demo addresses, fixed and public. Kept here rather than in an env var
 * because they have gone missing from the dashboard twice, and both sites are
 * ours — see the note above.
 */
export const DEMO_WEB = 'https://radian-web-tan.vercel.app';
export const DEMO_ADMIN = 'https://radian-admin.vercel.app';

/** Every origin allowed to call the API — CORS reads this. */
export function corsOrigins(): string[] {
  const fromEnv = [
    process.env.PUBLIC_WEB_URL,
    process.env.PUBLIC_ADMIN_URL,
    ...(process.env.CORS_ORIGINS ?? '').split(','),
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map(trim);

  const localDev = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];

  return Array.from(new Set([...fromEnv, ...localDev, DEMO_WEB, DEMO_ADMIN]));
}

/**
 * Every STOREFRONT address worth knocking on after a catalogue write.
 *
 * The configured one first — on the real shop that is the one that matters —
 * and the demo behind it, so a missing or stale env var cannot silently switch
 * the whole mechanism off again. The admin is not here: it is a single-page
 * app and caches nothing.
 *
 * `localhost:3000` is included when it is where the shop runs, so this works
 * with no configuration at all.
 */
export function storefrontOrigins(): string[] {
  const configured = [process.env.PUBLIC_WEB_URL, process.env.WEB_PUBLIC_URL]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map(trim);

  const local = process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000'];

  return Array.from(new Set([...configured, ...local, DEMO_WEB]));
}
