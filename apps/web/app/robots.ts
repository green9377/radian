import type { MetadataRoute } from "next";
import { getSiteSeo } from "./_data/seo";

/*
  /robots.txt — the admin's rules, verbatim.

  The API already composes the whole file (`SeoService.robotsTxt`): the
  allow/deny skeleton, the owner's extra lines, the sitemap pointer, and the
  site-wide "Disallow: /" when indexing is off. Recomposing it here from the
  same fields would be a second author for one document — so this route only
  TRANSLATES the finished text into Next's shape.

  ⚠️ Next wants structure, not text. The translation is deliberately narrow:
  user-agent lines, allow/disallow, sitemap. An owner line the parser does not
  recognise is dropped rather than guessed at — robots.txt is one of the few
  files where a malformed guess can de-index a shop.
*/
export default async function robots(): Promise<MetadataRoute.Robots> {
  /*  ডেমো সাইট Google-এ উঠলে যা হয়: `demo-rose-1`, `sobuj`, `radian` —
      এই test slug গুলো search result-এ ঢুকে যায়, আর আসল দোকান চালু হলে
      নিজেরই duplicate content-এর সাথে প্রতিযোগিতা করতে হয়। একবার index
      হলে সরাতে সপ্তাহ লাগে。

      Admin → SEO-তে "indexing বন্ধ" টগল আছে ঠিকই, কিন্তু ওটা মনে রাখার
      উপর নির্ভরশীল। ডেমোতে এটা env দিয়ে **হার্ড-লক** — ভুলে যাওয়ার
      সুযোগই নেই। `NEXT_PUBLIC_DEMO_MODE=true` থাকলে নিচের এক লাইনই
      পুরো ফাইলের উত্তর。  */
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  const seo = await getSiteSeo();

  const allow: string[] = [];
  const disallow: string[] = [];
  let sitemap: string | undefined;

  for (const raw of seo.robots.split("\n")) {
    const line = raw.trim();
    const lower = line.toLowerCase();
    if (lower.startsWith("allow:")) allow.push(line.slice(6).trim());
    else if (lower.startsWith("disallow:")) disallow.push(line.slice(9).trim());
    else if (lower.startsWith("sitemap:")) sitemap = line.slice(8).trim();
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: allow.length ? allow : undefined,
        disallow: disallow.length ? disallow : undefined,
      },
    ],
    sitemap,
  };
}
