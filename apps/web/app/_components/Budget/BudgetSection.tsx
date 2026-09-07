"use client";

import { useEffect, useState } from "react";
import SectionHead from "../ui/SectionHead";
import type { Zone } from "../../_store/useZoneStore";
import { getShopCollections, zoneCode } from "../../_data/shop";
import ArchCard, { RangePanel } from "../ui/ArchCard";

/*
  Gifts for Every Budget — the featured collections (Storefront → Collections),
  one card each. A PRICE_RANGE collection's page filters by today's price, a
  MANUAL one lists its hand-picked products; the card only links there.

  ⚠️ 5 Sep 2026 — there is no typed-in fallback any more. Four made-up cards
  ("Under ৳1,000" → /collections/under-1000) used to show whenever the shop had
  no featured collection, and every one of them was a dead link: a budget rail
  that does not filter by budget. No featured collection now means no rail.
  A card without a picture shows the site's one placeholder (TileImage).
*/

interface Card {
  key: string;
  kicker: string;
  title: string;
  sub: string;
  href: string;
  premium: boolean;
  imageUrl: string | null;
}

export default function BudgetSection({ zone }: { zone?: Zone | null }) {
  const [cards, setCards] = useState<Card[]>([]);

  /*
    LIVE since 31 Jul 2026. The gradient stays as the fallback art, indexed so
    each card keeps its own tone until a photograph exists — the same treatment
    as the category rail, for the same reason: most of these will have no image
    for a while and must still look deliberate.

    `accent` carries the rose-gold treatment rather than a colour field. The
    owner picks which card is the top tier; he does not pick the colour, for the
    reasons in the banner notes.
  */
  useEffect(() => {
    let alive = true;
    getShopCollections(zoneCode(zone ?? null)).then((rows) => {
      if (!alive || rows === null) return;
      setCards(
        rows.map((c) => ({
          key: c.slug,
          kicker: c.kicker ?? "",
          title: c.name,
          sub: c.subtitle ?? "",
          href: `/collections/${c.slug}`,
          premium: c.accent,
          imageUrl: c.imageUrl,
        })),
      );
    });
    return () => { alive = false; };
  }, [zone]);

  if (cards.length === 0) return null;

  return (
    <section className="bg-lavender py-[var(--section-y)]" id="budget">
      <div className="max-w-[var(--page-w)] mx-auto px-6">
        {/* Section head */}
        <SectionHead
          sectionKey="home.budget"
          eyebrow="Beautiful at every price"
          title="Gifts for Every Budget"
          subtitle={"Thoughtful never has to mean expensive."}
        />

        {/* Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[22px]">
          {cards.map((b) => (
            <ArchCard
              key={b.key}
              href={b.href}
              title={b.title}
              sub={b.sub}
              imageUrl={b.imageUrl}
              panel={<RangePanel kicker={b.kicker} label={b.title} accent={b.premium} />}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
