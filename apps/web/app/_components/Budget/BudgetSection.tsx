"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SectionHead from "../ui/SectionHead";
import type { Zone } from "../../_store/useZoneStore";
import { getShopCollections, zoneCode } from "../../_data/shop";
import { mediaVariant } from "../../_data/media";

/*
  Gifts for Every Budget — the featured collections (Storefront → Collections),
  one card each. A PRICE_RANGE collection's page filters by today's price, a
  MANUAL one lists its hand-picked products; the card only links there.

  ⚠️ 5 Sep 2026 — there is no typed-in fallback any more. Four made-up cards
  ("Under ৳1,000" → /collections/under-1000) used to show whenever the shop had
  no featured collection, and every one of them was a dead link: a budget rail
  that does not filter by budget. No featured collection now means no rail.
  The gradient below is only the backdrop for a card without a photo.
*/
const TONES = [
  "linear-gradient(160deg,#F2DFF5,#D9B5E8)",
  "linear-gradient(160deg,#EFD9EE,#D3A8DC)",
  "linear-gradient(160deg,#E8D4F0,#C49BDD)",
  "linear-gradient(160deg,#EFD8D3,#C99A92)",
];

interface Card {
  key: string;
  kicker: string;
  title: string;
  sub: string;
  href: string;
  bg: string;
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
        rows.map((c, i) => ({
          key: c.slug,
          kicker: c.kicker ?? "",
          title: c.name,
          sub: c.subtitle ?? "",
          href: `/collections/${c.slug}`,
          bg: TONES[i % TONES.length],
          premium: c.accent,
          imageUrl: mediaVariant(c.imageUrl, "card"),
        })),
      );
    });
    return () => { alive = false; };
  }, [zone]);

  if (cards.length === 0) return null;

  return (
    <section className="bg-lavender py-[46px]" id="budget">
      <div className="max-w-[1200px] mx-auto px-6">
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
            <Link
              key={b.key}
              href={b.href}
              className="relative rounded-[28px] overflow-hidden aspect-[1/1.14] shadow-soft transition-all duration-300 hover:-translate-y-[7px] hover:shadow-lift block bg-cover bg-center"
              style={b.imageUrl ? { backgroundImage: `url(${b.imageUrl})` } : { background: b.bg }}
            >
              {/* Dark gradient overlay for text legibility */}
              <div
                className="absolute inset-0 z-[2]"
                style={{
                  background: b.premium
                    ? "linear-gradient(180deg,transparent 30%,rgba(64,26,32,.9) 100%)"
                    : "linear-gradient(180deg,transparent 38%,rgba(50,0,73,.85) 100%)",
                }}
              />
              {/* Text */}
              <div className="absolute left-0 right-0 bottom-0 z-[3] p-[22px] text-white">
                <div
                  className={`text-[11px] tracking-[0.2em] uppercase font-semibold whitespace-nowrap ${
                    b.premium ? "text-rosegold-light" : "text-orchid-mid"
                  }`}
                >
                  {b.kicker}
                </div>
                <h3 className="font-display text-[22px] font-medium whitespace-nowrap mt-[3px] mb-[1px]">
                  {b.title}
                </h3>
                <span className="text-[12.5px] text-white/80 whitespace-nowrap">
                  {b.sub}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
