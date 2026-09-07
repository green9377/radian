import type { Metadata } from "next";

import { getShopTagGroups } from "../_data/shop";
import ArchCard from "../_components/ui/ArchCard";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /occasions — the occasions index. The footer's "Occasions", the hero's
  "Shop by occasion" and every category's "All Occasions" land here.

  The cards are the admin's occasion tags (Occasions & Tags) — add or hide
  one and the page changes by itself. No hand-written list stands in when
  the API is away (owner, 6 Sep 2026). GBE order locked: Reviews → Visit
  Store → Footer (Footer in layout.tsx).
*/

export const metadata: Metadata = {
  title: "Shop Gifts By Occasion | Radian",
  description:
    "Birthday, anniversary, love, get well soon and more — find the perfect flowers and gifts for every occasion, with same day, express and midnight delivery across Bangladesh.",
};

export default async function OccasionsIndexPage() {
  const groups = await getShopTagGroups();
  /*  ⚠️ Only OCCASION-type groups — "occasion" in the slug or the name.
      Otherwise "Bouquet" and "For Her" sit in this grid dressed as occasions
      (caught on the first run). No such group: the first group, not an
      empty page.  */
  const occGroups = (groups ?? []).filter((g) => /occasion/i.test(g.slug) || /occasion/i.test(g.name));
  const pick = occGroups.length ? occGroups : (groups ?? []).slice(0, 1);
  const cards = pick.flatMap((g) => g.tags).map((tag) => ({
    slug: tag.slug,
    label: tag.name,
    sub: tag.summary,
    imageUrl: tag.imageUrl,
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
            <ArchCard key={o.slug} href={`/occasions/${o.slug}`} title={o.label} sub={o.sub} imageUrl={o.imageUrl} />
          ))}
        </div>
      </section>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
