"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import TileImage from "../ui/TileImage";
import SectionHead from "../ui/SectionHead";
import type { Zone } from "../Header/Header";
import { getShopCategories, categoryCountLabel, zoneCode } from "../../_data/shop";

/*
  Shop by Category — horizontal carousel of category cards.

  LIVE as of 30 Jul 2026 — reads the Category master from the admin panel:
  name, summary, image, sort order. Add a category in the admin and it appears
  here; reorder it there and it moves here.

  Two things are deliberate:

  1. No hand-written fallback (owner, 6 Sep 2026). If the API is unreachable
     the section is absent — it never shows categories the shop does not have.

  2. Card art is a real <img> (TileImage); a category without a picture shows
     the site's one quiet placeholder, never a random tint.
*/

interface Card {
  name: string;
  sub: string;
  href: string;
  imageUrl: string | null;
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      className="w-[18px] h-[18px] stroke-current fill-none stroke-[2]"
      viewBox="0 0 24 24"
    >
      {dir === "left" ? (
        <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

export default function CategorySection({ zone, config = {} }: { zone?: Zone | null; config?: Record<string, unknown> }) {
  /*  How many cards at most — the section's own setting (Storefront →
      Homepage → Layout → Shop by Category, 4 Sep 2026). 0 = every featured
      category, which is what the rail always did.  */
  const limit = Math.max(Number(config.limit) || 0, 0);
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  // nothing until the live list arrives — no invented categories (owner, 6 Sep 2026)
  const [items, setItems] = useState<Card[]>([]);

  useEffect(() => {
    let alive = true;
    const zc = zoneCode(zone ?? null);
    getShopCategories().then((rows) => {
      // null = API unreachable → the section stays absent. An empty array is
      // a real answer (every category switched off) and renders as absent too.
      if (!alive || rows === null) return;
      setItems(
        rows
          // Owner's decision, 30 Jul: the homepage rail is a chosen shortlist,
          // not the whole catalogue. Twenty categories can exist without twenty
          // cards appearing here. Tick "Featured" to put one on the homepage.
          .filter((c) => c.isFeatured)
          // 6 Aug 2026 — per-zone rail. A category marked "Dhaka only" in the
          // admin's Shop by Category list stays off the nationwide homepage
          // and vice versa; null means both, so nothing changes until the
          // owner picks a zone. The header MENU stays unfiltered on purpose —
          // hiding a category from the menu would hide its page too.
          .filter((c) => !zc || !c.zone || c.zone === zc)
          /*  5 Sep 2026 (owner) — a category with nothing to sell in this zone
              is not a card: it stays in the admin untouched and reappears the
              moment its first product is published. Same rule as the menu.  */
          .filter((c) => (zc === "NATIONWIDE" ? c.nationwideCount : c.productCount) > 0)
          .slice(0, limit > 0 ? limit : undefined)
          .map((c) => ({
            name: c.name,
            sub: categoryCountLabel(c, "products"),
            href: `/${c.slug}`,
            imageUrl: c.imageUrl,
          })),
      );
    });
    return () => {
      alive = false;
    };
  }, [zone, limit]);

  const updateButtons = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  useEffect(() => {
    updateButtons();
    window.addEventListener("resize", updateButtons);
    return () => window.removeEventListener("resize", updateButtons);
    // `items` matters: the arrows are measured against the track's width, and
    // the track is empty on the first pass — the live list arrives a moment
    // later. Without re-measuring, a shop with three categories still shows a
    // "scroll right" arrow that does nothing when pressed.
  }, [updateButtons, items]);

  const scroll = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  const btnBase =
    "absolute top-1/2 -translate-y-[60%] z-[5] w-11 h-11 rounded-full bg-white text-purple grid place-items-center shadow-lift border border-lavender-deep transition-opacity duration-200 hover:bg-purple hover:text-white cursor-pointer";

  // Nothing featured → hide the whole section, heading included. An empty rail
  // under "Shop by Category" looks broken; an absent section looks intentional.
  if (items.length === 0) return null;

  return (
    <section className="py-[var(--section-y)]" id="categories">
      <div className="max-w-[var(--page-w)] mx-auto px-6">
        {/* Section head */}
        <SectionHead
          sectionKey="home.categories"
          eyebrow="Curated for every moment"
          title="Shop by Category"
        />

        {/* Mobile: compact 4-column grid (FlowerAura-style) */}
        <div className="grid grid-cols-4 gap-x-3 gap-y-4 md:hidden">
          {items.map((cat) => (
            <Link key={cat.href} href={cat.href} className="text-center group">
              <TileImage
                src={cat.imageUrl}
                alt={cat.name}
                variant="thumb"
                className="aspect-square rounded-2xl shadow-soft transition-transform duration-200 group-active:scale-95"
              />
              <span className="block mt-1.5 text-[11.5px] font-medium text-purple leading-tight">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>

        {/* Desktop: carousel */}
        <div className="relative hidden md:block">
          <button
            aria-label="Scroll left"
            onClick={() => scroll(-1)}
            className={`${btnBase} -left-4 ${canPrev ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <Chevron dir="left" />
          </button>

          <div
            ref={trackRef}
            onScroll={updateButtons}
            className="flex gap-[22px] overflow-x-auto snap-x snap-mandatory scroll-smooth px-1 pt-[6px] pb-[18px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((cat) => (
              <Link
                key={cat.href}
                href={cat.href}
                className="w-[178px] shrink-0 snap-start text-center group"
              >
                <TileImage
                  src={cat.imageUrl}
                  alt={cat.name}
                  className="h-[178px] rounded-[28px] shadow-soft transition-all duration-300 group-hover:-translate-y-[6px] group-hover:shadow-lift"
                />
                <h3 className="mt-[13px] text-[16px] font-medium text-purple whitespace-nowrap">
                  {cat.name}
                </h3>
                {/* empty when a category has too few products to boast about */}
                {cat.sub && (
                  <span className="text-[12.5px] text-body-soft whitespace-nowrap">
                    {cat.sub}
                  </span>
                )}
              </Link>
            ))}
          </div>

          <button
            aria-label="Scroll right"
            onClick={() => scroll(1)}
            className={`${btnBase} -right-4 ${canNext ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <Chevron dir="right" />
          </button>
        </div>
      </div>
    </section>
  );
}
