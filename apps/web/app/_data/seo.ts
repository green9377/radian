import { baseFor } from "./shop";

/*
  ═══════════════════════════════════════════════════════════════════════════
  SITE-LEVEL SEO — the admin's `/settings/seo` finally reaching the pages.

  PER-PAGE meta (product, category, brand) was wired on 2 Aug (DEC-PRD-024):
  those six boxes flow through the entity endpoints. What never flowed was the
  SITE level — the owner could set a title template, a default description,
  Google/Bing verification codes and the "allow indexing" switch, and the
  storefront read none of it. `layout.tsx` carried a hand-typed title that
  promised "delivered in as little as 2 hours" — the same retired promise, on
  every single page's <title>.

  Server-side only. `generateMetadata`, `robots.ts` and `sitemap.ts` all run
  on the server, so this never ships to the browser bundle.

  ⚠️ CACHED FOR 60s, per server process. Metadata runs on every request of
  every page; hitting the API each time would put the SEO table in the hot
  path of the whole shop. A minute of staleness on a meta tag is nothing —
  Google reads it days apart.

  ⚠️ FALLBACKS ARE THE SHIPPED WORDS. If the API is down the site must still
  have a title — but the fallback words make no speed claim, for the same
  reason the announcement bar's fallback doesn't: an unverifiable promise is
  not a fallback, it is a lie waiting for an outage.
  ═══════════════════════════════════════════════════════════════════════════
*/

export interface SiteSeo {
  titleTemplate: string | null;
  siteName: string | null;
  defaultMetaDescription: string | null;
  defaultOgImageUrl: string | null;
  twitterHandle: string | null;
  googleVerification: string | null;
  bingVerification: string | null;
  allowIndexing: boolean;
  sitemapEnabled: boolean;
  robots: string;
  redirects: { fromPath: string; toPath: string; permanent: boolean }[];
}

export const SEO_FALLBACK: SiteSeo = {
  titleTemplate: null,
  siteName: "Radian",
  defaultMetaDescription:
    "Fresh flowers and thoughtful gifts, hand-arranged in Dhaka and delivered while the moment still matters.",
  defaultOgImageUrl: null,
  twitterHandle: null,
  googleVerification: null,
  bingVerification: null,
  allowIndexing: true,
  sitemapEnabled: true,
  robots: "User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /checkout\nDisallow: /cart",
  redirects: [],
};

let cached: { at: number; value: SiteSeo } | null = null;
const TTL_MS = 60_000;

export async function getSiteSeo(): Promise<SiteSeo> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const res = await fetch(`${baseFor()}/seo/public`, {
      // Next-এর নিজের fetch-cache-ও ৬০ সেকেন্ড — দুটো স্তর একই কথা বলে
      next: { revalidate: 60 },
    });
    if (!res.ok) return cached?.value ?? SEO_FALLBACK;
    const j = (await res.json()) as Partial<SiteSeo>;
    const value: SiteSeo = { ...SEO_FALLBACK, ...j };
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return cached?.value ?? SEO_FALLBACK;
  }
}

/**
 * "%s | Radian" ছাঁচে একটা পাতার title বসানো।
 *
 * ⚠️ template-এ `%s` না থাকলে template-টাই title — মালিক হয়তো পুরো লেখাটা
 * নিজে লিখতে চেয়েছেন। ভাঙা `%s` ছাপা যাবে না।
 */
export function applyTitleTemplate(pageTitle: string, seo: SiteSeo): string {
  const t = seo.titleTemplate?.trim();
  if (!t) return pageTitle;
  return t.includes("%s") ? t.replace("%s", pageTitle) : t;
}
