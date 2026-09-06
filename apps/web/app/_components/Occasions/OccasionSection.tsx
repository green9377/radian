"use client";

import TileImage from "../ui/TileImage";
import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import SectionHead from "../ui/SectionHead";
import { getShopTagGroups, tagHref } from "../../_data/shop";

/*
  Every Occasion, Every Person — two tabs (By Occasion / By Relation),
  each a horizontal snap carousel of arch-shaped cards.
  The tabs are the admin's tag groups, the cards their tags; no hand-written
  fallback (owner, 6 Sep 2026) — until the groups arrive there is nothing.
*/

type Card = { title: string; sub: string; href: string; imageUrl?: string | null };
type Tab = { key: string; label: string; cards: Card[] };

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

export default function OccasionSection() {
  /*
    LIVE since 31 Jul 2026 — the tabs are the tag GROUPS, the cards are the
    tags inside them. Adding a group in the admin adds a tab here; no code.

    Only groups set to show as cards are returned (`displayStyle`), because a
    group meant to be filter chips would look wrong as a big arch card.
  */
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");

  useEffect(() => {
    let alive = true;
    getShopTagGroups().then((groups) => {
      if (!alive || !groups || groups.length === 0) return;
      setTabs(
        groups.map((g) => ({
          key: g.slug,
          label: g.name,
          cards: g.tags.map((t) => ({
            title: t.name,
            sub: t.summary ?? "",
            // `/recipients/her` was a 404 from the day the section was built —
            // /occasions exists, its twin never did. See `tagHref`.
            href: tagHref(g.slug, t.slug),
            imageUrl: t.imageUrl,
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

  // no groups (or the API away) → the section is absent, not a row of nothing
  if (tabs.length === 0) return null;

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
              <TileImage
                src={card.imageUrl}
                alt={card.title}
                className="aspect-[4/3.6] rounded-t-[90px] rounded-b-[14px] shadow-soft transition-transform duration-200 group-active:scale-95"
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
                <TileImage
                  src={card.imageUrl}
                  alt={card.title}
                  className="aspect-[4/4.1] rounded-t-[140px] rounded-b-[18px] shadow-soft transition-all duration-300 group-hover:-translate-y-[7px] group-hover:shadow-lift"
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
