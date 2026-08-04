import type { MetadataRoute } from "next";
import { getSiteSeo } from "./_data/seo";
import { getShopCategories, getShopProducts } from "./_data/shop";

/*
  /sitemap.xml — Google-কে দোকানের মানচিত্র, আসল catalogue থেকে।

  এতদিন ছিলই না — মালিকের SEO settings-এ "sitemap" switch ছিল, আর switch-টা
  একটা অস্তিত্বহীন ফাইলের দিকে দেখাত। এখন প্রতিটা published product আর
  category এখান দিয়ে Google-এ পৌঁছায়; admin-এ নতুন product তুললে পরের
  crawl-এই সে মানচিত্রে।

  ⚠️ যা ইচ্ছা করেই নেই: cart/checkout/account (robots-এও বন্ধ), আর mock-এর
  কোনো পাতা। sitemap-এ মিথ্যা ঠিকানা দিলে Google আস্থা হারায় — খালি সত্যিটাই
  দামি।

  ⚠️ `sitemapEnabled` false হলে খালি তালিকা — switch-টা এখন সত্যিই কিছু বন্ধ
  করে।
*/

/*  ⚠️ আসল domain env থেকে — deployment-এর দিন `NEXT_PUBLIC_SITE_URL` বসালেই
    sitemap নতুন ঠিকানায়। hardcode থাকলে ভুল domain-এর মানচিত্র Google-এ যেত।  */
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
    /*  ৬০-এর সীমা `/shop/products`-এর নিজের; catalogue বড় হলে এখানে
        pagination বসবে — আজকের দোকানে এক পাতাই যথেষ্ট।  */
    getShopProducts({ limit: 60 }),
  ]);

  const catPages: MetadataRoute.Sitemap = (cats ?? []).flatMap((c) => [
    { url: `${BASE}/categories/${c.slug}`, changeFrequency: "daily" as const },
    ...c.children.map((s) => ({
      url: `${BASE}/categories/${c.slug}/${s.slug}`,
      changeFrequency: "daily" as const,
    })),
  ]);

  const productPages: MetadataRoute.Sitemap = (prods?.items ?? []).map((p) => ({
    url: `${BASE}/products/${p.slug}`,
    changeFrequency: "daily" as const,
  }));

  return [...staticPages, ...catPages, ...productPages];
}
