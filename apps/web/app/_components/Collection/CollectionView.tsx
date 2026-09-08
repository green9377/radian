"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { useZoneStore } from "../../_store/useZoneStore";
import {
  COLLECTIONS,
  getCollection,
} from "../../_data/collections";
import {
  getCollectionDetail,
  getShopCollections,
  zoneCode,
  type CollectionDetail,
} from "../../_data/shop";
import { toProduct } from "../../_data/categoryApi";
import type { Product } from "../../_data/products";
import ProductCard from "../Product/ProductCard";

/*
  ═══════════════════════════════════════════════════════════════════
  COLLECTION VIEW — /collections/[slug] এর client অংশ।

  - config আসে slug থেকে (getCollection)। filtering/zone সব _data/collections.ts
    → getCollectionProducts()-এ; এই component শুধু দেখায় (D23: rule component-এ নয়)।
  - zone hydration guard SearchView-এর হুবহু pattern (SSR/first render মেলে)।
  - budget chip row: সব collection-এ jump; active chip highlighted।
  - sort: Featured / Price ↑ / Price ↓ (budget shopping-এ দরকারি)। sort UI-only,
    দাম মূল data থেকেই — কোনো নতুন সংখ্যা এখানে বানানো হয় না।
  - ProductCard reuse; Load More CategoryProductGrid/Search-এর মতোই।
  - খালি হলে সৎ message + browse-all CTA (match বলে চালানো হয় না)।
  ═══════════════════════════════════════════════════════════════════
*/

const PAGE_SIZE = 8;

type SortKey = "featured" | "asc" | "desc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "asc", label: "Price: low to high" },
  { key: "desc", label: "Price: high to low" },
];

/* zone hydration guard — useCartHydrated-এর হুবহু pattern। */
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

export default function CollectionView({ slug }: { slug: string }) {
  const config = getCollection(slug);

  const hydrated = useZoneHydrated();
  const zone = useZoneStore((s) => s.zone);
  const effZone = hydrated ? zone : null;

  const [shown, setShown] = useState(PAGE_SIZE);
  const [sort, setSort] = useState<SortKey>("featured");

  /*
    ═══ DB প্রথম — ৪ আগস্ট ২০২৬ (মালিকের নিয়ম: কিছুই static নয়) ═══

    Admin → Storefront → Collections-এ এই slug থাকলে নাম-কথা-পণ্য সব
    সেখান থেকে; PRICE_RANGE ব্যান্ড আজকের ছাড়ের-পরের দামে মেলে। পুরনো
    hard-coded তালিকা শুধু সেই slug-এর জন্য যেটা DB-তে নেই — আর সেটাও
    সরে দাঁড়াবে যেদিন মালিক ওই নামের collection বানাবেন।

    chips-ও live তালিকা থেকে (homepage-এর budget rail-এর একই getter),
    যাতে নতুন collection বানালেই এখানে নিজে থেকে হাজির হয়।
  */
  const [live, setLive] = useState<CollectionDetail | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  useEffect(() => {
    let stale = false;
    setLiveLoading(true);
    getCollectionDetail(slug, zoneCode(effZone)).then((d) => {
      if (stale) return;
      setLive(d);
      setLiveLoading(false);
    });
    return () => { stale = true; };
  }, [slug, effZone]);

  const [liveChips, setLiveChips] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    let stale = false;
    getShopCollections(zoneCode(effZone)).then((rows) => {
      if (!stale && rows) setLiveChips(rows.map((r) => ({ slug: r.slug, name: r.name })));
    });
    return () => { stale = true; };
  }, [effZone]);

  // slug/zone/sort বদলালে grid প্রথম পাতায় reset (adjust-during-render pattern)।
  const [prevKey, setPrevKey] = useState(`${slug}|${effZone}|${sort}`);
  const key = `${slug}|${effZone}|${sort}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setShown(PAGE_SIZE);
  }

  /*  ⚠️ THE SHOP'S OWN PRODUCTS, OR NONE (9 Sep 2026). This used to fall back
      to `getCollectionProducts(config)` — the hand-written catalogue in
      `_data/products.ts` — so a collection the admin has not filled showed
      products that do not exist, at prices nobody set. An empty collection is
      the truth and says so below.  */
  const results = useMemo<Product[]>(() => {
    const list = live ? live.items.map(toProduct) : [];
    if (sort === "asc") return [...list].sort((a, b) => a.pricePaisa - b.pricePaisa);
    if (sort === "desc") return [...list].sort((a, b) => b.pricePaisa - a.pricePaisa);
    return list; // featured = data order
  }, [live, config, effZone, sort]);

  if (liveLoading && !config) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <span className="text-[13.5px] text-body-soft">Loading collection…</span>
      </div>
    );
  }

  if (!live && !config) {
    return (
      <div className="max-w-[620px] mx-auto text-center py-16">
        <h1 className="font-display text-[26px] font-medium text-purple">
          Collection not found
        </h1>
        <p className="text-body-soft mt-3 text-[15px] font-light">
          This collection doesn&apos;t exist. Browse everything instead.
        </p>
        <Link
          href="/fresh-flowers"
          className="inline-flex items-center gap-2 mt-6 px-8 py-[13px] bg-purple text-white rounded-full font-medium text-[15px] transition-all duration-300 hover:bg-purple-deep hover:-translate-y-[2px] hover:shadow-lift"
        >
          Shop all flowers <ArrowIcon />
        </Link>
      </div>
    );
  }

  const zoneLabel = effZone === "bangladesh" ? "All Bangladesh" : "Inside Dhaka";
  /*  header-এর তিনটে লাইন: DB-র সারি জিতলে kicker/name/subtitle, নইলে
      পুরনো config। খালি subtitle-এ generic এক লাইন — ফাঁকা জায়গা নয়।  */
  const heading = {
    eyebrow: live?.kicker ?? config?.eyebrow ?? "Collection",
    title: live?.name ?? config?.title ?? slug,
    lede:
      live?.subtitle ??
      config?.lede ??
      "Hand-picked gifts from the Radian studio.",
  };
  const siblings = liveChips.length
    ? liveChips.map((c) => ({ slug: c.slug, chip: c.name }))
    : config
      ? COLLECTIONS.filter((c) => c.kind === config.kind).map((c) => ({ slug: c.slug, chip: c.chip }))
      : [];
  const visible = results.slice(0, shown);
  const hasMore = shown < results.length;

  return (
    <section className="pb-4">
      {/* ── Header ── */}
      <div className="max-w-[820px] mx-auto text-center mt-4 mb-8 px-2">
        <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase text-orchid font-semibold whitespace-nowrap mb-3">
          <span className="w-[9px] h-[9px] bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
          {heading.eyebrow}
        </div>
        <h1 className="font-display text-[clamp(28px,4vw,44px)] font-medium text-purple leading-[1.14]">
          {heading.title}
        </h1>
        <p className="text-body font-light text-[16px] leading-[1.7] mt-4 max-w-[620px] mx-auto">
          {heading.lede}
        </p>
      </div>

      {/* ── Sibling chips (same kind only — budget tiers ↔ budget, theme ↔ theme) ── */}
      {siblings.length > 1 && (
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 mb-7">
        <div className="flex gap-2.5 flex-wrap justify-center">
          {siblings.map((c) => {
            const active = c.slug === slug;
            return (
              <Link
                key={c.slug}
                href={`/collections/${c.slug}`}
                aria-current={active ? "page" : undefined}
                className={`px-5 py-2.5 rounded-full text-[13.5px] font-medium whitespace-nowrap transition-all duration-300 ${
                  active
                    ? "bg-purple text-white shadow-[0_10px_24px_rgba(71,0,102,0.22)]"
                    : "bg-white text-purple border border-lavender-deep hover:border-orchid hover:-translate-y-[1px]"
                }`}
              >
                {c.chip}
              </Link>
            );
          })}
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
            <label htmlFor="collection-sort" className="text-[13px] text-body-soft">
              Sort
            </label>
            <select
              id="collection-sort"
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
              Nothing in this price range for {zoneLabel} right now. Try another
              budget above, or browse everything.
            </p>
            <Link
              href="/fresh-flowers"
              className="inline-flex items-center gap-2 mt-6 px-8 py-[13px] bg-purple text-white rounded-full font-medium text-[15px] transition-all duration-300 hover:bg-purple-deep hover:-translate-y-[2px] hover:shadow-lift"
            >
              Shop all flowers <ArrowIcon />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
