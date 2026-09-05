"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { useZoneStore } from "../../_store/useZoneStore";
import { getShopProducts, zoneCode } from "../../_data/shop";
import { toProduct } from "../../_data/categoryApi";
import type { Product } from "../../_data/products";
import ProductCard from "../Product/ProductCard";

/*
  ═══════════════════════════════════════════════════════════════════
  OCCASION (live) — /occasions/[slug], admin-এর Tag থেকে।

  মালিকের নিয়ম (৪ আগস্ট): কিছুই static নয়। এই view-র সবটা আসে দুই
  জায়গা থেকে — শিরোনাম/এক-লাইন Occasions & Tags-এর tag-সারি থেকে
  (server page হয়ে props-এ), আর পণ্য `/shop/products?occasion=` থেকে,
  যেটা product-এ বসানো tag ধরে মেলে। মালিক admin-এ occasion বানালে বা
  কোনো product-এ tag দিলে পাতাটা নিজে নিজেই বদলায়।

  Grid-টা CollectionView-এর সংক্ষিপ্ত জাত — sort + Load More, খালি হলে
  সৎ বার্তা। ৭১-item mock-এর কোনো চিহ্ন এখানে নেই।
  ═══════════════════════════════════════════════════════════════════
*/

const PAGE_SIZE = 8;
type SortKey = "featured" | "asc" | "desc";

function useZoneHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useZoneStore.persist.onFinishHydration(onChange),
    () => useZoneStore.persist.hasHydrated(),
    () => false,
  );
}

export default function OccasionLive({
  slug,
  name,
  summary,
}: {
  slug: string;
  name: string;
  summary: string | null;
}) {
  const hydrated = useZoneHydrated();
  const zone = useZoneStore((s) => s.zone);
  const effZone = hydrated ? zone : null;

  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [sort, setSort] = useState<SortKey>("featured");

  useEffect(() => {
    let stale = false;
    setLoading(true);
    getShopProducts({ occasion: slug, zone: zoneCode(effZone) ?? undefined, sort: "popular", limit: 60 }).then(
      (res) => {
        if (stale) return;
        setItems(res ? res.items.map(toProduct) : []);
        setLoading(false);
        setShown(PAGE_SIZE);
      },
    );
    return () => {
      stale = true;
    };
  }, [slug, effZone]);

  const results = useMemo(() => {
    if (sort === "asc") return [...items].sort((a, b) => a.pricePaisa - b.pricePaisa);
    if (sort === "desc") return [...items].sort((a, b) => b.pricePaisa - a.pricePaisa);
    return items;
  }, [items, sort]);

  const visible = results.slice(0, shown);
  const zoneLabel = effZone === "bangladesh" ? "All Bangladesh" : "Inside Dhaka";

  return (
    <section className="pb-4">
      <div className="max-w-[820px] mx-auto text-center mt-8 mb-8 px-2">
        <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase text-orchid font-semibold whitespace-nowrap mb-3">
          <span className="w-[9px] h-[9px] bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
          Shop by occasion
        </div>
        <h1 className="font-display text-[clamp(28px,4vw,44px)] font-medium text-purple leading-[1.14]">
          {name}
        </h1>
        <p className="text-body font-light text-[16px] leading-[1.7] mt-4 max-w-[620px] mx-auto">
          {summary ?? `Hand-arranged flowers and gifts for ${name.toLowerCase()} — delivered right on time.`}
        </p>
      </div>

      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap border-b border-lavender-deep pb-4">
          <p className="text-[14px] text-body-soft font-light">
            {loading ? "Loading…" : `${results.length} ${results.length === 1 ? "gift" : "gifts"}`} · delivering to {zoneLabel}
          </p>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort"
            className="text-[13.5px] text-purple font-medium bg-white border border-lavender-deep rounded-full px-4 py-2 cursor-pointer outline-none focus:border-orchid"
          >
            <option value="featured">Featured</option>
            <option value="asc">Price: low to high</option>
            <option value="desc">Price: high to low</option>
          </select>
        </div>
      </div>

      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6">
        {visible.length > 0 ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] lg:gap-[26px]">
              {visible.map((p) => (
                <ProductCard key={p.slug} product={p} zone={effZone} />
              ))}
            </div>
            {shown < results.length && (
              <div className="flex justify-center mt-10">
                <button
                  onClick={() => setShown((n) => n + PAGE_SIZE)}
                  className="inline-flex items-center gap-[10px] px-11 py-[15px] rounded-full border-[1.5px] border-purple text-purple text-[15px] font-medium cursor-pointer transition-all duration-300 hover:bg-purple hover:text-white hover:shadow-lift"
                >
                  Load More
                </button>
              </div>
            )}
          </>
        ) : loading ? null : (
          <div className="max-w-[560px] mx-auto text-center py-14">
            <p className="text-[15px] text-body-soft font-light">
              Nothing tagged for {name} in {zoneLabel} yet — browse everything instead.
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 mt-6 px-8 py-[13px] bg-purple text-white rounded-full font-medium text-[15px] transition-all duration-300 hover:bg-purple-deep hover:-translate-y-[2px] hover:shadow-lift"
            >
              Shop all gifts
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
