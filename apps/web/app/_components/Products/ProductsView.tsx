"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { useZoneStore } from "../../_store/useZoneStore";
import { type Product } from "../../_data/products";
import { getShopCategories, getShopProducts, zoneCode } from "../../_data/shop";
import { toProduct } from "../../_data/categoryApi";
import ProductCard from "../Product/ProductCard";

/*
  ═══════════════════════════════════════════════════════════════════
  PRODUCTS VIEW — /products (shop-all) এর client অংশ।

  - সব product এক জায়গায়; category chip + sort + zone দিয়ে filter।
  - filtering/zone logic এখানেই (কোনো নতুন সংখ্যা বানানো হয় না — দাম/tag
    মূল _data/products.ts থেকেই)।
  - zone hydration guard SearchView/Collection-এর হুবহু pattern।
  - ProductCard reuse; Load More CategoryProductGrid-এর মতোই।
  ═══════════════════════════════════════════════════════════════════
*/

const PAGE_SIZE = 12;

type SortKey = "featured" | "asc" | "desc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "asc", label: "Price: low to high" },
  { key: "desc", label: "Price: high to low" },
];

/*  ⚠️ CAT_LABELS মুছে গেছে — chip-এর নাম এখন admin-এর category-র নিজের নাম।
    মালিক "Gift Boxes"-কে "Gift Hampers" করলে chip-ও তাই বলবে।  */

function useZoneHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useZoneStore.persist.onFinishHydration(onChange),
    () => useZoneStore.persist.hasHydrated(),
    () => false,
  );
}

function ArrowIcon() {
  return (
    <svg className="w-[16px] h-[16px] stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
      <path d="M4 12h16m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ProductsView() {
  const hydrated = useZoneHydrated();
  const zone = useZoneStore((s) => s.zone);
  const effZone = hydrated ? zone : null;

  const [cat, setCat] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("featured");
  const [shown, setShown] = useState(PAGE_SIZE);

  // filter/sort/zone বদলালে grid প্রথম পাতায় reset (adjust-during-render)।
  const [prevKey, setPrevKey] = useState(`${cat}|${effZone}|${sort}`);
  const key = `${cat}|${effZone}|${sort}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setShown(PAGE_SIZE);
  }

  /*
    ═══ THE MOCK CATALOGUE LEFT THIS PAGE — 4 Aug 2026 ═══

    This was the SHOP-ALL page, and it listed the 71 invented products from
    `_data/products.ts` — every one clickable, none of them for sale. The owner
    uploads a product in the admin and the "shop all" page did not show it;
    the four demo bouquets it did show 404'd on click. The full-catalogue page
    was the single most misleading screen on the site.

    Now: one request per (category · zone · sort), answered by the same
    `/shop/products` the category pages use, converted by the same
    `toProduct`. The chips come from the live category list — a category the
    owner creates appears here without anyone touching this file.

    ⚠️ `stale` guard, same reason as everywhere: switch chips twice fast and
    the slower answer must not paint over the newer one.
  */
  const [cats, setCats] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    let stale = false;
    getShopCategories().then((rows) => {
      if (!stale && rows) {
        /*  nationwide zone-এ শুধু সেই chip যার courier-safe জিনিস আছে —
            খালি chip মানে click করে শূন্য পাতা।  */
        const usable =
          effZone === "bangladesh" ? rows.filter((c) => c.nationwideCount > 0) : rows;
        setCats(usable.map((c) => ({ slug: c.slug, name: c.name })));
      }
    });
    return () => {
      stale = true;
    };
  }, [effZone]);

  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let stale = false;
    setLoading(true);
    getShopProducts({
      category: cat === "all" ? undefined : cat,
      zone: zoneCode(effZone) ?? undefined,
      sort: sort === "asc" ? "price_asc" : sort === "desc" ? "price_desc" : "popular",
      limit: 60,
    }).then((res) => {
      if (stale) return;
      setResults(res ? res.items.map(toProduct) : []);
      setLoading(false);
    });
    return () => {
      stale = true;
    };
  }, [cat, effZone, sort]);

  const zoneLabel = effZone === "bangladesh" ? "All Bangladesh" : "Inside Dhaka";
  const visible = results.slice(0, shown);
  const hasMore = shown < results.length;

  const chipBase =
    "px-5 py-2.5 rounded-full text-[13.5px] font-medium whitespace-nowrap transition-all duration-300";

  return (
    <section className="pb-4">
      {/* ── Header ── */}
      <div className="max-w-[820px] mx-auto text-center mt-4 mb-8 px-2">
        <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase text-orchid font-semibold whitespace-nowrap mb-3">
          <span className="w-[9px] h-[9px] bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
          Everything in one place
        </div>
        <h1 className="font-display text-[clamp(28px,4vw,44px)] font-medium text-purple leading-[1.14]">
          Shop all flowers & gifts
        </h1>
        <p className="text-body font-light text-[16px] leading-[1.7] mt-4 max-w-[620px] mx-auto">
          Browse the full Radian range — flowers, cakes, gift boxes and more,
          all hand-arranged and delivered fast.
        </p>
      </div>

      {/* ── Category chips ── */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 mb-7">
        <div className="flex gap-2.5 flex-wrap justify-center">
          <button
            onClick={() => setCat("all")}
            aria-pressed={cat === "all"}
            className={`${chipBase} cursor-pointer ${
              cat === "all"
                ? "bg-purple text-white shadow-[0_10px_24px_rgba(71,0,102,0.22)]"
                : "bg-white text-purple border border-lavender-deep hover:border-orchid hover:-translate-y-[1px]"
            }`}
          >
            All
          </button>
          {cats.map((c) => (
            <button
              key={c.slug}
              onClick={() => setCat(c.slug)}
              aria-pressed={cat === c.slug}
              className={`${chipBase} cursor-pointer ${
                cat === c.slug
                  ? "bg-purple text-white shadow-[0_10px_24px_rgba(71,0,102,0.22)]"
                  : "bg-white text-purple border border-lavender-deep hover:border-orchid hover:-translate-y-[1px]"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Result bar: count + sort ── */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap border-b border-lavender-deep pb-4">
          <p className="text-[14px] text-body-soft font-light">
            {results.length} {results.length === 1 ? "gift" : "gifts"} · delivering
            to {zoneLabel}
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="products-sort" className="text-[13px] text-body-soft">
              Sort
            </label>
            <select
              id="products-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="text-[13.5px] text-purple font-medium bg-white border border-lavender-deep rounded-full px-4 py-2 cursor-pointer outline-none focus:border-orchid"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Grid / empty ── */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        {visible.length > 0 ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] lg:gap-[26px]">
              {visible.map((p) => (
                <ProductCard key={p.slug} product={p} zone={effZone} />
              ))}
            </div>

            {hasMore && (
              <div className="flex flex-col items-center gap-3 mt-10">
                <div className="text-[13px] text-body-soft">
                  Showing {visible.length} of {results.length}
                </div>
                <button
                  onClick={() => setShown((n) => n + PAGE_SIZE)}
                  className="inline-flex items-center gap-[10px] px-11 py-[15px] rounded-full border-[1.5px] border-purple text-purple text-[15px] font-medium whitespace-nowrap cursor-pointer transition-all duration-300 hover:bg-purple hover:text-white hover:shadow-lift"
                >
                  Load More <ArrowIcon />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="max-w-[560px] mx-auto text-center py-14">
            <p className="text-[15px] text-body-soft font-light">
              Nothing here for {zoneLabel} in this category right now. Try another
              category or switch delivery area.
            </p>
            <Link
              href="/categories/fresh-flowers"
              className="inline-flex items-center gap-2 mt-6 px-8 py-[13px] bg-purple text-white rounded-full font-medium text-[15px] transition-all duration-300 hover:bg-purple-deep hover:-translate-y-[2px] hover:shadow-lift"
            >
              Browse fresh flowers <ArrowIcon />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
