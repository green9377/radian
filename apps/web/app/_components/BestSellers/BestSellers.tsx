"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import SectionHead from "../ui/SectionHead";
import type { Zone } from "../../_store/useZoneStore";
import { type Product } from "../../_data/products";
import { getShopProducts, zoneCode } from "../../_data/shop";
import { toProduct } from "../../_data/categoryApi";
import ProductCard from "../Product/ProductCard";

/*
  Best Selling Flowers & Gifts — zone-aware product grid.
  Spec rules (from approved board):
  - All Bangladesh zone → only courier-safe (zone "both") products
  - Category tabs with NO eligible products for the zone are hidden entirely
  - If the active tab becomes hidden after a zone switch, fall back to "all"
  - Max 8 products shown
  - Sticky tabs while scrolling the section

  ═══ THE MOCK LEFT, 4 Aug 2026 ═══

  "Best sellers" was the mock's `best: true` flag — eight invented bouquets,
  fixed for ever, on the most-read band of the homepage, while the REAL
  best-seller count (`salesCount`, +1 on every delivered order) accumulated in
  the admin unread. Now one popularity-sorted fetch per zone answers the band,
  and the tabs keep their own rule: a tab with nothing eligible hides itself.
*/

type TabCat = "all" | string;

const TABS: { cat: TabCat; label: string }[] = [
  { cat: "all", label: "All Products" },
  { cat: "flowers", label: "Flowers" },
  { cat: "cakes", label: "Cakes" },
  { cat: "balloons", label: "Balloon Bouquets" },
  { cat: "chocolates", label: "Chocolate Bouquets" },
  { cat: "giftboxes", label: "Gift Boxes" },
];

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

  /*  One popularity-sorted fetch per zone (24 cards) — the tab filter then
      slices it client-side, so switching tabs costs nothing.  */
  const [pool, setPool] = useState<Product[]>([]);
  useEffect(() => {
    let stale = false;
    getShopProducts({ sort: "popular", limit: 24, zone: zoneCode(zone) ?? undefined }).then(
      (res) => {
        if (!stale) setPool(res ? res.items.map(toProduct) : []);
      },
    );
    return () => {
      stale = true;
    };
  }, [zone]);

  // Tabs that have at least one eligible product for this zone
  const visibleTabs = useMemo(
    () => TABS.filter((t) => t.cat === "all" || pool.some((p) => p.cat === t.cat)),
    [pool],
  );

  // If active tab was hidden by a zone switch, fall back to "all"
  const effectiveCat = visibleTabs.some((t) => t.cat === activeCat)
    ? activeCat
    : "all";

  const items = useMemo(
    () =>
      pool
        .filter((p) => effectiveCat === "all" || p.cat === effectiveCat)
        .slice(0, 8),
    [pool, effectiveCat],
  );

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
            <b className="block font-display text-[20px] text-purple font-medium mb-[6px]">
              Nothing here yet
            </b>
            More gifts for your area are coming soon.
          </div>
        )}

        {/* View all */}
        <div className="flex justify-center mt-8">
          <Link
            href="/products"
            className="inline-flex items-center gap-[10px] px-10 py-[14px] border-[1.5px] border-purple rounded-full text-purple font-medium text-[15px] tracking-[0.04em] transition-all duration-300 hover:bg-purple hover:text-white hover:shadow-lift whitespace-nowrap"
          >
            View All Products <ArrowIcon />
          </Link>
        </div>
      </div>
    </section>
  );
}
