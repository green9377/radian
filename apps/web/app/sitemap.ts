import type { MetadataRoute } from "next";
import { getSiteSeo } from "./_data/seo";
import { getShopCategories, getShopProducts } from "./_data/shop";

/*
  /sitemap.xml — the shop's map for Google, built from the REAL catalogue.

  It simply did not exist for a while — the owner's SEO settings had a
  "sitemap" switch pointing at a file that was never there. Now every
  published product and category reaches Google through here; a product
  added in the admin is on the map by the next crawl.

  ⚠️ Deliberately absent: cart/checkout/account (blocked in robots too), and
  any mock page. A sitemap with false addresses costs Google's trust — only
  the truth is worth listing.

  ⚠️ `sitemapEnabled` false → an empty list — the switch finally switches
  something.
*/

/*  ⚠️ The real domain comes from env — on deployment day, setting
    `NEXT_PUBLIC_SITE_URL` re-addresses the whole sitemap. Hardcoded, the
    wrong domain's map would have gone to Google.  */
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://radianbd.com").replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = await getSiteSeo();
  if (!seo.sitemapEnabled) return [];

  const staticPages: MetadataRoute.Sitemap = [
    "",
    "/products",
    "/occasions",
    "/faq",
    "/about",
    "/contact",
    "/delivery-info",
    "/journal",
    "/track",
  ].map((p) => ({ url: `${BASE}${p}`, changeFrequency: "weekly" as const }));

  const [cats, prods] = await Promise.all([
    getShopCategories(),
    /*  The limit of 60 is `/shop/products`' own cap; when the catalogue
        outgrows it, pagination goes here — today one page holds the shop.  */
    getShopProducts({ limit: 60 }),
  ]);

  const catPages: MetadataRoute.Sitemap = (cats ?? []).flatMap((c) => [
    { url: `${BASE}/${c.slug}`, changeFrequency: "daily" as const },
    ...c.children.map((s) => ({
      url: `${BASE}/${c.slug}/${s.slug}`,
      changeFrequency: "daily" as const,
    })),
  ]);

  const productPages: MetadataRoute.Sitemap = (prods?.items ?? []).map((p) => ({
    url: `${BASE}/p/${p.slug}`,
    changeFrequency: "daily" as const,
  }));

  return [...staticPages, ...catPages, ...productPages];
}
