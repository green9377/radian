"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useZoneStore } from "../../_store/useZoneStore";
import { type Product } from "../../_data/products";
import { getCollectionDetail, getShopCategories, getShopProducts, zoneCode } from "../../_data/shop";
import { toProduct } from "../../_data/categoryApi";
import ProductCard from "../Product/ProductCard";

/*
  ═══════════════════════════════════════════════════════════════════
  PRODUCTS VIEW — the client half of /products (shop all).

  - every product in one place; category chips + sort + zone filter it
  - the zone hydration guard is the same pattern as SearchView / Collection
  - ProductCard is reused; Load More works like CategoryProductGrid

  ═══ THE ADDRESS IS A FILTER — 5 Sep 2026 ═══
  The Gift Finder ends on `/products?recipients=mom&occasions=birthday&budget=
  2000-5000`, and this page used to ignore every one of those — the shopper
  answered three questions and landed on the unfiltered shop. Now the query
  string is read: `recipients` / `occasions` / `tag` / `occasion` (tag slugs),
  `budget` (a price-range collection's slug → its window), `min` / `max`
  (taka), `category`, `speed`, `best` and `sort`. What is applied is shown as
  chips above the grid, each removable, so nobody wonders why the list is short.
  ═══════════════════════════════════════════════════════════════════
*/

const PAGE_SIZE = 12;

type SortKey = "featured" | "asc" | "desc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "asc", label: "Price: low to high" },
  { key: "desc", label: "Price: high to low" },
];

/*  ⚠️ CAT_LABELS is gone — a chip carries the admin's own category name.
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
  const router = useRouter();
  const params = useSearchParams();

  /*  the filters that arrive in the address — the Gift Finder's answers, a
      budget card, a link from a campaign. Tag params may name several tags
      (recipients + occasions); the API takes one `tag` and one `occasion`. */
  const urlFilters = useMemo(() => {
    const tags = [params.get("recipients"), params.get("tag")].filter(Boolean) as string[];
    const occasions = [params.get("occasions"), params.get("occasion")].filter(Boolean) as string[];
    const num = (k: string) => { const v = Number(params.get(k)); return params.get(k) && Number.isFinite(v) ? v : undefined; };
    const sortParam = params.get("sort");
    return {
      tag: tags[0],
      occasion: occasions[0],
      budget: params.get("budget") || undefined,
      min: num("min"),
      max: num("max"),
      category: params.get("category") || undefined,
      speed: params.get("speed") || undefined,
      best: params.get("best") === "1" ? (1 as const) : undefined,
      sort: sortParam === "price_asc" ? "asc" : sortParam === "price_desc" ? "desc" : undefined,
    };
  }, [params]);

  const [cat, setCat] = useState<string>(urlFilters.category ?? "all");
  const [sort, setSort] = useState<SortKey>((urlFilters.sort as SortKey | undefined) ?? "featured");
  const [shown, setShown] = useState(PAGE_SIZE);

  /*  a budget slug is a price-range collection — its window becomes min/max.
      null while it is being looked up; the grid waits for it.  */
  const [budget, setBudget] = useState<{ slug: string; name: string; min?: number; max?: number } | null>(null);
  useEffect(() => {
    let stale = false;
    const slug = urlFilters.budget;
    if (!slug) return;
    getCollectionDetail(slug, zoneCode(effZone) ?? undefined).then((c) => {
      if (stale) return;
      setBudget(c ? {
        slug,
        name: c.name,
        min: c.minPaisa == null ? undefined : c.minPaisa / 100,
        max: c.maxPaisa == null ? undefined : c.maxPaisa / 100,
      } : { slug, name: slug });
    });
    return () => { stale = true; };
  }, [urlFilters.budget, effZone]);
  const budgetWin = urlFilters.budget && budget?.slug === urlFilters.budget ? budget : null;
  const budgetReady = !urlFilters.budget || budgetWin !== null;

  // grid back to page one whenever a filter, the sort or the zone changes (adjust-during-render)
  const filterKey = JSON.stringify(urlFilters);
  const [prevKey, setPrevKey] = useState(`${cat}|${effZone}|${sort}|${filterKey}`);
  const key = `${cat}|${effZone}|${sort}|${filterKey}`;
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
            /*  in the nationwide zone only the chips with courier-safe products —
            an empty chip is a click onto an empty page  */
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
    if (!budgetReady) return;
    let stale = false;
    setLoading(true);
    getShopProducts({
      category: cat === "all" ? undefined : cat,
      zone: zoneCode(effZone) ?? undefined,
      sort: sort === "asc" ? "price_asc" : sort === "desc" ? "price_desc" : "popular",
      tag: urlFilters.tag,
      occasion: urlFilters.occasion,
      min: budgetWin?.min ?? urlFilters.min,
      max: budgetWin?.max ?? urlFilters.max,
      speed: urlFilters.speed,
      best: urlFilters.best,
      limit: 60,
    }).then((res) => {
      if (stale) return;
      setResults(res ? res.items.map(toProduct) : []);
      setLoading(false);
    });
    return () => {
      stale = true;
    };
  }, [cat, effZone, sort, urlFilters, budgetWin, budgetReady]);

  /*  the applied address filters as removable chips. Removing one rewrites
      the address, so the back button and a shared link both keep working.  */
  const applied: { key: string; label: string }[] = [];
  const pretty = (slug: string) => slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  if (urlFilters.tag) applied.push({ key: "recipients", label: `For: ${pretty(urlFilters.tag)}` });
  if (urlFilters.occasion) applied.push({ key: "occasions", label: `Occasion: ${pretty(urlFilters.occasion)}` });
  if (urlFilters.budget) applied.push({ key: "budget", label: `Budget: ${budgetWin?.name ?? urlFilters.budget}` });
  if (!urlFilters.budget && (urlFilters.min !== undefined || urlFilters.max !== undefined)) {
    applied.push({ key: "min", label: `Price: ${urlFilters.min !== undefined ? `৳${urlFilters.min}` : "any"} – ${urlFilters.max !== undefined ? `৳${urlFilters.max}` : "any"}` });
  }
  if (urlFilters.speed) applied.push({ key: "speed", label: `Delivery: ${urlFilters.speed.replace("_", " ")}` });
  if (urlFilters.best) applied.push({ key: "best", label: "Best sellers" });
  const removeFilter = (k: string) => {
    const next = new URLSearchParams(params.toString());
    const drop = k === "recipients" ? ["recipients", "tag"] : k === "occasions" ? ["occasions", "occasion"] : k === "min" ? ["min", "max"] : [k];
    drop.forEach((d) => next.delete(d));
    router.replace(`/products${next.toString() ? `?${next}` : ""}`);
  };

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
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 mb-7">
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

      {/* ── The filters that came with the address ── */}
      {applied.length > 0 && (
        <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 mb-5">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="text-[13px] text-body-soft">Showing gifts</span>
            {applied.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => removeFilter(f.key)}
                title="Remove this filter"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orchid-soft text-purple text-[13px] font-semibold border border-orchid/40 hover:bg-white transition-colors cursor-pointer"
              >
                {f.label} <span aria-hidden className="text-[15px] leading-none">×</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => router.replace("/products")}
              className="text-[13px] text-body-soft hover:text-purple underline underline-offset-2 cursor-pointer"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* ── Result bar: count + sort ── */}
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 mb-6">
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
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6">
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
              Nothing here for {zoneLabel} {applied.length > 0 ? "with these filters" : "in this category"} right now. Try another
              category{applied.length > 0 ? ", remove a filter" : ""} or switch delivery area.
            </p>
            <Link
              href="/fresh-flowers"
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
