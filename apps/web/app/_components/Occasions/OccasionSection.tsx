"use client";

import { mediaVariant } from "../../_data/media";
import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import SectionHead from "../ui/SectionHead";
import { getShopTagGroups, tagHref } from "../../_data/shop";

/*
  Every Occasion, Every Person — two tabs (By Occasion / By Relation),
  each a horizontal snap carousel of arch-shaped cards.
  Static section (same for both zones, per approved design board).
  Images: gradient placeholders until real photo shoot (Cloudinary later).
*/

type Card = { title: string; sub: string; href: string; bg: string; imageUrl?: string | null };
type Tab = { key: string; label: string; cards: Card[] };

const OCCASIONS: Card[] = [
  {
    title: "Birthday Gifts",
    sub: "Make their day unforgettable",
    href: "/occasions/birthday",
    bg: "linear-gradient(170deg,#F7E5F4,#E9C0E2)",
  },
  {
    title: "Anniversary Gifts",
    sub: "Celebrate your story",
    href: "/occasions/anniversary",
    bg: "linear-gradient(170deg,#F6E1E6,#EBC0CB)",
  },
  {
    title: "Love & Romance",
    sub: "When words aren't enough",
    href: "/occasions/love-romance",
    bg: "linear-gradient(170deg,#F8E3EE,#EFC2DC)",
  },
  {
    title: "Just Because",
    sub: "No reason needed",
    href: "/occasions/just-because",
    bg: "linear-gradient(170deg,#EFE4F8,#DBC2F0)",
  },
  {
    title: "Mother's Day",
    sub: "For the first love of your life",
    // ⚠️ mothers-day-এর নিজস্ব occasion def/product tag এখনো নেই — 404 এড়াতে
    // occasions index-এ পাঠাই। Marketing occasion+tag দিলে /occasions/mothers-day-এ ফেরাও।
    href: "/occasions",
    bg: "linear-gradient(170deg,#F5E9E0,#E9D2BE)",
  },
  {
    title: "Corporate Gifts",
    sub: "Impress every client",
    href: "/occasions/corporate",
    bg: "linear-gradient(170deg,#E7E9F5,#C9CFEB)",
  },
];

const RELATIONS: Card[] = [
  {
    title: "Gifts for Her",
    sub: "She deserves the world",
    href: "/recipients/her",
    bg: "linear-gradient(170deg,#F8E4F1,#EDC2DE)",
  },
  {
    title: "Gifts for Him",
    sub: "Thoughtful, not typical",
    href: "/recipients/him",
    bg: "linear-gradient(170deg,#E6EAF4,#C6D0E8)",
  },
  {
    title: "For Parents",
    sub: "Say thank you beautifully",
    href: "/recipients/parents",
    bg: "linear-gradient(170deg,#F4EADF,#E7D1B8)",
  },
  {
    title: "For Friends",
    sub: "Friendship day, every day",
    href: "/recipients/friends",
    bg: "linear-gradient(170deg,#E9F2E9,#CDE3D1)",
  },
  {
    title: "For Colleagues",
    sub: "Professional, personal",
    href: "/recipients/colleagues",
    bg: "linear-gradient(170deg,#F0E7F7,#DCC7EF)",
  },
  {
    title: "For Grandparents",
    sub: "Warmth across generations",
    href: "/recipients/grandparents",
    bg: "linear-gradient(170deg,#F6E9E2,#EAD3C2)",
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

/** the soft card tints, indexed so each position keeps its own look */
const TINTS = [
  "linear-gradient(170deg,#F7E5F4,#E9C0E2)",
  "linear-gradient(170deg,#F6E1E6,#EBC0CB)",
  "linear-gradient(170deg,#F8E3EE,#EFC2DC)",
  "linear-gradient(170deg,#EFE4F8,#DBC2F0)",
  "linear-gradient(170deg,#F5E9E0,#E9D2BE)",
  "linear-gradient(170deg,#E7E9F5,#C9CFEB)",
];

export default function OccasionSection() {
  /*
    LIVE since 31 Jul 2026 — the tabs are the tag GROUPS, the cards are the
    tags inside them. Adding a group in the admin adds a tab here; no code.

    Only groups set to show as cards are returned (`displayStyle`), because a
    group meant to be filter chips would look wrong as a big arch card.

    The old hard-coded arrays stay as the fallback, and carry the note that
    Mother's Day had no tag of its own — the reason its link pointed at the
    index page instead of a real one.
  */
  const [tabs, setTabs] = useState<Tab[]>([
    { key: "occ", label: "By Occasion", cards: OCCASIONS },
    { key: "rel", label: "By Relation", cards: RELATIONS },
  ]);
  const [activeTab, setActiveTab] = useState<string>("occ");

  useEffect(() => {
    let alive = true;
    getShopTagGroups().then((groups) => {
      if (!alive || !groups || groups.length === 0) return;
      setTabs(
        groups.map((g) => ({
          key: g.slug,
          label: g.name,
          cards: g.tags.map((t, i) => ({
            title: t.name,
            sub: t.summary ?? "",
            // `/recipients/her` was a 404 from the day the section was built —
            // /occasions exists, its twin never did. See `tagHref`.
            href: tagHref(g.slug, t.slug),
            bg: TINTS[i % TINTS.length],
            imageUrl: mediaVariant(t.imageUrl, "card"),
          })),
        })),
      );
      setActiveTab(groups[0].slug);
    });
    return () => { alive = false; };
  }, []);
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const updateButtons = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  useEffect(() => {
    // reset scroll when switching tabs
    trackRef.current?.scrollTo({ left: 0 });
    updateButtons();
    window.addEventListener("resize", updateButtons);
    return () => window.removeEventListener("resize", updateButtons);
  }, [activeTab, updateButtons]);

  const scroll = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  const cards = tabs.find((t) => t.key === activeTab)?.cards ?? [];

  const tabBase =
    "px-7 py-[10px] rounded-full text-[14px] font-medium whitespace-nowrap transition-all duration-200 cursor-pointer border-[1.5px]";
  const btnBase =
    "absolute top-1/2 -translate-y-[60%] z-[5] w-11 h-11 rounded-full bg-white text-purple grid place-items-center shadow-lift border border-lavender-deep transition-opacity duration-200 hover:bg-purple hover:text-white cursor-pointer";

  return (
    <section className="bg-lavender py-[var(--section-y)]" id="occasions">
      <div className="max-w-[var(--page-w)] mx-auto px-6">
        {/* Section head */}
        <SectionHead
          sectionKey="home.occasions"
          eyebrow="Surprise your loved ones"
          title="Every Occasion, Every Person"
          subtitle={"Find the perfect gift by the moment — or by who it's for."}
        />

        {/* Tabs — one per group, so a new group needs no code here */}
        {tabs.length > 1 && (
          <div className="flex justify-center gap-[10px] mb-6 flex-wrap">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`${tabBase} ${
                  activeTab === t.key
                    ? "bg-purple text-white border-purple"
                    : "bg-white text-body-soft border-lavender-deep"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Mobile: 2 visible, rest swipe from the right */}
        <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden">
          {cards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="group w-[calc(50%-6px)] shrink-0 snap-start"
            >
              <div
                className="aspect-[4/3.6] rounded-t-[90px] rounded-b-[14px] overflow-hidden shadow-soft transition-transform duration-200 group-active:scale-95"
                style={card.imageUrl ? { backgroundImage: `url(${card.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: card.bg }}
              />
              <div className="mt-2 text-center">
                <h3 className="font-display text-[15px] font-medium text-purple leading-tight">
                  {card.title}
                </h3>
              </div>
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
            className="flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth px-1 pt-[6px] pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {cards.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="w-[268px] shrink-0 snap-start group"
              >
                <div
                  className="aspect-[4/4.1] rounded-t-[140px] rounded-b-[18px] overflow-hidden shadow-soft transition-all duration-300 group-hover:-translate-y-[7px] group-hover:shadow-lift"
                  style={card.imageUrl ? { backgroundImage: `url(${card.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: card.bg }}
                />
                <div className="mt-[11px] text-center">
                  <h3 className="font-display text-[20px] font-medium text-purple whitespace-nowrap">
                    {card.title}
                  </h3>
                  <span className="text-[12.5px] text-body-soft whitespace-nowrap">
                    {card.sub}
                  </span>
                </div>
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
