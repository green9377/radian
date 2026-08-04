"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import SectionHead from "../ui/SectionHead";
import { getShopCategories, categoryCountLabel } from "../../_data/shop";

/*
  Shop by Category — horizontal carousel of category cards.

  LIVE as of 30 Jul 2026 — reads the Category master from the admin panel:
  name, summary, image, sort order. Add a category in the admin and it appears
  here; reorder it there and it moves here.

  Two things are deliberate:

  1. `FALLBACK` below is not dead code. If the API is unreachable the rail
     renders these instead of collapsing. A shop with a stale rail still sells;
     a shop with an empty homepage does not. (See `_data/shop.ts`.)

  2. Card art falls back to a gradient, never to grey or an empty box. Real
     photography is still a launch dependency, so most categories will have no
     `imageUrl` for a while and must look deliberate meanwhile.
*/

/** Soft palette for cards with no photo yet — indexed, so it is stable per position. */
const TINTS = [
  "linear-gradient(160deg,#F6E3F3,#EAC3E6)",
  "linear-gradient(160deg,#FBEDE4,#F2D3C0)",
  "linear-gradient(160deg,#F1E4F8,#DFC5F0)",
  "linear-gradient(160deg,#F4E6DE,#E5CBBB)",
  "linear-gradient(160deg,#E7F2E7,#CBE3CE)",
  "linear-gradient(160deg,#F3E7F8,#E1C9F1)",
  "linear-gradient(160deg,#FBEAF0,#F2CBDD)",
  "linear-gradient(160deg,#F1E6F6,#DFC8ED)",
];

interface Card {
  name: string;
  sub: string;
  href: string;
  bg: string;
  imageUrl: string | null;
}

const FALLBACK: Card[] = [
  {
    name: "Fresh Flowers",
    sub: "120+ arrangements",
    href: "/categories/fresh-flowers",
    bg: "linear-gradient(160deg,#F6E3F3,#EAC3E6)",
    imageUrl: null,
  },
  {
    name: "Cakes",
    sub: "Baked fresh daily",
    href: "/categories/cakes",
    bg: "linear-gradient(160deg,#FBEDE4,#F2D3C0)",
    imageUrl: null,
  },
  {
    name: "Flower Combos",
    sub: "Flowers + cake + card",
    href: "/categories/flower-combos",
    bg: "linear-gradient(160deg,#F1E4F8,#DFC5F0)",
    imageUrl: null,
  },
  {
    name: "Chocolates",
    sub: "Premium boxes",
    href: "/categories/chocolates",
    bg: "linear-gradient(160deg,#F4E6DE,#E5CBBB)",
    imageUrl: null,
  },
  {
    name: "Plants",
    sub: "Gifts that grow",
    href: "/categories/plants",
    bg: "linear-gradient(160deg,#E7F2E7,#CBE3CE)",
    imageUrl: null,
  },
  {
    name: "Personalised",
    sub: "Made only for them",
    href: "/categories/personalised",
    bg: "linear-gradient(160deg,#F3E7F8,#E1C9F1)",
    imageUrl: null,
  },
  {
    name: "Balloon Bouquets",
    sub: "Float their heart",
    href: "/categories/balloon-bouquets",
    bg: "linear-gradient(160deg,#FBEAF0,#F2CBDD)",
    imageUrl: null,
  },
  {
    name: "Gift Boxes",
    sub: "Curated with love",
    href: "/categories/gift-boxes",
    bg: "linear-gradient(160deg,#F1E6F6,#DFC8ED)",
    imageUrl: null,
  },
];

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

export default function CategorySection() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  const [items, setItems] = useState<Card[]>(FALLBACK);

  useEffect(() => {
    let alive = true;
    getShopCategories().then((rows) => {
      // null = API unreachable → keep FALLBACK. An empty array is a real answer
      // (every category switched off) and must NOT be overridden, or the owner
      // turns them all off in the admin and nothing appears to happen.
      if (!alive || rows === null) return;
      setItems(
        rows
          // Owner's decision, 30 Jul: the homepage rail is a chosen shortlist,
          // not the whole catalogue. Twenty categories can exist without twenty
          // cards appearing here. Tick "Featured" to put one on the homepage.
          .filter((c) => c.isFeatured)
          .map((c, i) => ({
            name: c.name,
            sub: categoryCountLabel(c, "products"),
            href: `/categories/${c.slug}`,
            bg: TINTS[i % TINTS.length],
            imageUrl: c.imageUrl,
          })),
      );
    });
    return () => {
      alive = false;
    };
  }, []);

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
    <section className="py-[46px]" id="categories">
      <div className="max-w-[1200px] mx-auto px-6">
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
              <div
                className="aspect-square rounded-2xl shadow-soft transition-transform duration-200 group-active:scale-95 bg-cover bg-center"
                style={
                  cat.imageUrl
                    ? { backgroundImage: `url(${cat.imageUrl})` }
                    : { background: cat.bg }
                }
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
                <div
                  className="h-[178px] rounded-[28px] overflow-hidden shadow-soft transition-all duration-300 group-hover:-translate-y-[6px] group-hover:shadow-lift bg-cover bg-center"
                  style={
                    cat.imageUrl
                      ? { backgroundImage: `url(${cat.imageUrl})` }
                      : { background: cat.bg }
                  }
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
