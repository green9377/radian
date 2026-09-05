import type { Metadata } from "next";
import Link from "next/link";

import { OCCASION_LIST } from "../_data/categories";
import { getShopTagGroups } from "../_data/shop";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /occasions — Occasions index।

  Footer "Occasions", Hero "Shop by occasion", category-র "All Occasions"
  (OccasionGrid viewAllHref) — সবাই এখানে আসে। আগে page ছিল না, ৪০৪ হতো।

  Lean: শুধু ৮টা canonical occasion-এর arch-card grid + GBE। data
  OCCASION_LIST থেকে (product-count সহ) — খালি occasion দেখাই না (D43)।
  GBE order locked: Reviews → VisitStore → Footer (Footer layout.tsx-এ)।

  Server component — কোনো interactivity নেই, তাই "use client" লাগে না।
*/

export const metadata: Metadata = {
  title: "Shop Gifts By Occasion | Radian",
  description:
    "Birthday, anniversary, love, get well soon and more — find the perfect flowers and gifts for every occasion, with same day, express and midnight delivery across Bangladesh.",
};

/*  arch-card-এর রঙ — DB-র tag-এ ছবি না থাকলে এই আটটা gradient ঘুরে বসে,
    যাতে ছবি ছাড়া occasion-ও খালি ধূসর না দেখায়।  */
const FALLBACK_BG = [
  "linear-gradient(160deg,#F3E2FA 0%,#E3C4F3 60%,#D5A8EC 100%)",
  "linear-gradient(160deg,#FCE7EF 0%,#F6C6DA 60%,#EFA8C6 100%)",
  "linear-gradient(160deg,#E7F0FC 0%,#C6DAF6 60%,#A8C6EF 100%)",
  "linear-gradient(160deg,#FDF3E2 0%,#F6E2C0 60%,#EFD2A3 100%)",
  "linear-gradient(160deg,#E8F9EE 0%,#C4EED4 60%,#A3E2BC 100%)",
  "linear-gradient(160deg,#F9E8E8 0%,#EEC4C4 60%,#E2A3A3 100%)",
  "linear-gradient(160deg,#EFE7FC 0%,#D6C6F6 60%,#BDA8EF 100%)",
  "linear-gradient(160deg,#E7FBFC 0%,#C6EFF3 60%,#A8E2E9 100%)",
];

export default async function OccasionsIndexPage() {
  /*
    ═══ DB প্রথম — ৪ আগস্ট ২০২৬ (মালিকের নিয়ম: কিছুই static নয়) ═══
    Admin → Occasions & Tags-এর featured tag-গুলোই এই grid। মালিক occasion
    যোগ/লুকালে পাতা নিজে বদলায়। হাতে-লেখা OCCASION_LIST শুধু API-নাগালহীন
    মুহূর্তের fallback।
  */
  const groups = await getShopTagGroups();
  /*  ⚠️ শুধু OCCASION-জাতীয় group — নামে/slug-এ occasion আছে এমন। নইলে
      "Bouquet" আর "For Her"-ও occasion সেজে এই grid-এ বসে পড়ে (প্রথম
      চালানেই ধরা পড়েছিল)। এমন group না মিললে প্রথম group — খালি পাতা নয়।  */
  const occGroups = (groups ?? []).filter((g) => /occasion/i.test(g.slug) || /occasion/i.test(g.name));
  const pick = occGroups.length ? occGroups : (groups ?? []).slice(0, 1);
  const liveTags = pick.flatMap((g) => g.tags);
  const cards =
    liveTags.length > 0
      ? liveTags.map((tag, i) => ({
          slug: tag.slug,
          label: tag.name,
          sub: tag.summary,
          bg: tag.imageUrl ? `url(${tag.imageUrl}) center/cover` : FALLBACK_BG[i % FALLBACK_BG.length],
        }))
      : OCCASION_LIST.map((o) => ({
          slug: o.slug,
          label: o.label,
          sub: `${o.count} ${o.count === 1 ? "gift" : "gifts"}`,
          bg: o.bg,
        }));

  return (
    <main className="bg-[#F6F4FA]">
      <section className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 pt-10 sm:pt-12 pb-14">
        {/* ─── header ─── */}
        <div className="text-center max-w-[640px] mx-auto">
          <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase text-orchid font-semibold mb-3">
            <span className="w-[9px] h-[9px] bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
            Every moment, marked
          </div>
          <h1 className="font-display text-[clamp(28px,3.6vw,42px)] font-medium text-purple leading-[1.15]">
            Shop Gifts By Occasion
          </h1>
          <p className="text-body-soft mt-3 text-[15px] font-light">
            Whatever you&apos;re celebrating — pick the moment and we&apos;ll get
            it there, right on time.
          </p>
        </div>

        {/* ─── occasion grid ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5 mt-9 sm:mt-11">
          {cards.map((o) => (
            <Link key={o.slug} href={`/occasions/${o.slug}`} className="group">
              <div
                className="aspect-[4/4.1] rounded-t-[110px] rounded-b-[18px] shadow-soft transition-all duration-300 group-hover:-translate-y-[6px] group-hover:shadow-lift"
                style={{ background: o.bg }}
              />
              <div className="mt-3 text-center">
                <h2 className="font-display text-[16px] sm:text-[18px] font-medium text-purple leading-tight">
                  {o.label}
                </h2>
                {o.sub && <span className="text-[12.5px] text-body-soft">{o.sub}</span>}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
