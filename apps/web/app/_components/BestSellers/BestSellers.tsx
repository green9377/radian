"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import SectionHead from "../ui/SectionHead";
import type { Zone } from "../../_store/useZoneStore";
import { type Product } from "../../_data/products";
import { getHomeBestSellers, zoneCode, type HomeBestSellers } from "../../_data/shop";
import { toProduct } from "../../_data/categoryApi";
import ProductCard from "../Product/ProductCard";

/*
  Best Selling Flowers & Gifts — zone-aware product grid.
  Spec rules (from approved board):
  - All Bangladesh zone → only courier-safe (zone "both") products
  - Category tabs with NO eligible products for the zone are hidden entirely
  - If the active tab becomes hidden after a zone switch, fall back to "all"
  - Sticky tabs while scrolling the section

  ═══ THE MOCK LEFT, 4 Aug 2026 ═══

  "Best sellers" was the mock's `best: true` flag — eight invented bouquets,
  fixed for ever, on the most-read band of the homepage, while the REAL
  best-seller count accumulated in the admin unread.

  ═══ THE TABS AND THE RULE LEFT TOO, 4 Sep 2026 ═══

  What replaced the mock was one popularity-sorted fetch of 24 products, sliced
  by five tab slugs that were still the mock's (`flowers`, `cakes`…) and
  matched no live category — so only "All" ever showed, and "All" was a SORT,
  not a filter: badge holders first, then whatever `salesCount` (a typed
  field) and newest-first put next. A shelf called Best Sellers showing
  products that had never sold.

  Nothing is decided here now. `/shop/home-bestsellers` answers with the tabs
  (the owner's categories, in his order), the cards under each (the earned
  badge only, his own picks, or badge holders topped up — his choice), and the
  words around them. All of it is set under Storefront → Homepage → Layout →
  Best Sellers. This file only draws.
*/

type TabCat = "all" | string;

/** what shows in the moment before the API answers, and if it cannot */
const EMPTY: HomeBestSellers = {
  mode: "AUTO",
  tabs: [{ key: "all", label: "All Products", items: [] }],
  viewAll: { text: "View All Products", href: "/products" },
  empty: { title: "Nothing here yet", text: "More gifts for your area are coming soon." },
};

function ArrowIcon() {
  return (
    <svg
      className="w-[16px] h-[16px] stroke-current fill-none stroke-[1.8]"
      viewBox="0 0 24 24"
    >
      <path d="M4 12h16m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function BestSellers({ zone }: { zone: Zone | null }) {
  const [activeCat, setActiveCat] = useState<TabCat>("all");
  const [stickyTop, setStickyTop] = useState(112);

  // Tabs must stick right below the real (sticky) header, whatever its height
  useEffect(() => {
    const measure = () => {
      const h = document.querySelector("header")?.getBoundingClientRect().height;
      if (h) setStickyTop(Math.round(h) + 6);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /*  One fetch per zone, every tab already filled — switching tabs costs
      nothing, and the API has already left out any tab with nothing under it.  */
  const [grid, setGrid] = useState<HomeBestSellers>(EMPTY);
  useEffect(() => {
    let stale = false;
    getHomeBestSellers(zoneCode(zone)).then((res) => {
      if (!stale) setGrid(res ?? EMPTY);
    });
    return () => {
      stale = true;
    };
  }, [zone]);

  const visibleTabs = grid.tabs.map((t) => ({ cat: t.key, label: t.label }));

  // If active tab was hidden by a zone switch, fall back to "all"
  const effectiveCat = visibleTabs.some((t) => t.cat === activeCat)
    ? activeCat
    : "all";

  const items: Product[] = (grid.tabs.find((t) => t.key === effectiveCat)?.items ?? []).map(toProduct);

  return (
    <section className="py-[46px]" id="bestsellers">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Section head */}
        <SectionHead
          sectionKey="home.bestsellers"
          eyebrow="Loved by thousands"
          title="Best Selling Flowers & Gifts"
          subtitle={"Our most-gifted arrangements, chosen again and again."}
        />

        {/* Sticky tabs */}
        <div
          style={{ top: stickyTop }}
          className="sticky z-40 bg-white/95 backdrop-blur-[10px] py-[10px] rounded-full flex gap-[10px] mb-6 flex-nowrap overflow-x-auto justify-start md:flex-wrap md:overflow-visible md:justify-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab.cat}
              onClick={() => setActiveCat(tab.cat)}
              className={`shrink-0 px-5 md:px-7 py-[10px] rounded-full text-[14px] font-medium whitespace-nowrap transition-all duration-200 cursor-pointer border-[1.5px] ${
                effectiveCat === tab.cat
                  ? "bg-purple text-white border-purple"
                  : "bg-white text-body-soft border-lavender-deep"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Product grid */}
        {items.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-[22px]">
            {items.map((p) => (
              <ProductCard key={p.slug} product={p} zone={zone} />
            ))}
          </div>
        ) : (
          <div className="text-center py-11 px-5 bg-lavender rounded-[28px] text-body-soft">
            {grid.empty.title && (
              <b className="block font-display text-[20px] text-purple font-medium mb-[6px]">
                {grid.empty.title}
              </b>
            )}
            {grid.empty.text}
          </div>
        )}

        {/* View all — the owner's words and link, or no button at all */}
        {grid.viewAll && (
          <div className="flex justify-center mt-8">
            <Link
              href={grid.viewAll.href}
              className="inline-flex items-center gap-[10px] px-10 py-[14px] border-[1.5px] border-purple rounded-full text-purple font-medium text-[15px] tracking-[0.04em] transition-all duration-300 hover:bg-purple hover:text-white hover:shadow-lift whitespace-nowrap"
            >
              {grid.viewAll.text} <ArrowIcon />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
