"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SectionHead from "../ui/SectionHead";
import type { Zone } from "../../_store/useZoneStore";
import { getShopCollections, zoneCode } from "../../_data/shop";

/*
  Gifts for Every Budget — 4 collection cards on lavender band.
  Static section (same for both zones, per approved board).
  Card backgrounds: gradient placeholders until real photo shoot.
*/

const BUDGETS = [
  {
    kicker: "Sweet & simple",
    title: "Under ৳1,000",
    sub: "Little gestures, big smiles",
    href: "/collections/under-1000",
    bg: "linear-gradient(160deg,#F2DFF5,#D9B5E8)",
    premium: false,
  },
  {
    kicker: "The favourites",
    title: "৳1,000 – ৳2,000",
    sub: "Our most-loved range",
    href: "/collections/1000-2000",
    bg: "linear-gradient(160deg,#EFD9EE,#D3A8DC)",
    premium: false,
  },
  {
    kicker: "Go grand",
    title: "৳2,000 – ৳5,000",
    sub: "For moments that matter",
    href: "/collections/2000-5000",
    bg: "linear-gradient(160deg,#E8D4F0,#C49BDD)",
    premium: false,
  },
  {
    kicker: "Rose gold tier",
    title: "Premium Collection",
    sub: "Luxury, hand-finished",
    href: "/collections/premium",
    bg: "linear-gradient(160deg,#EFD8D3,#C99A92)",
    premium: true,
  },
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
  const [cards, setCards] = useState<Card[]>(
    BUDGETS.map((b) => ({ ...b, key: b.title, imageUrl: null })),
  );

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
      if (!alive || rows === null || rows.length === 0) return;
      setCards(
        rows.map((c, i) => ({
          key: c.slug,
          kicker: c.kicker ?? "",
          title: c.name,
          sub: c.subtitle ?? "",
          href: `/collections/${c.slug}`,
          bg: BUDGETS[i % BUDGETS.length].bg,
          premium: c.accent,
          imageUrl: c.imageUrl,
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
