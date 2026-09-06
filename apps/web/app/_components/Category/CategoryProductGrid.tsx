"use client";

import { useState } from "react";
import type { Zone } from "../../_store/useZoneStore";
import type { Product } from "../../_data/products";
import type { CategoryConfig, CategorySection } from "../../_data/categories";
import { getShopProducts } from "../../_data/shop";
import { toProduct } from "../../_data/categoryApi";
import ProductCard from "../Product/ProductCard";
import CategoryFilterBar from "./CategoryFilterBar";
import { ArrowIcon, Section, SectionHead } from "./SectionShell";

/*
  All Products — two rows (eight), then Load More.

  Every filter on this page is a query-string filter, read by the server and
  applied before the first render: the tiles, the delivery band, the budget
  cards and — since 5 Sep 2026 — the Gift Finder, which is the homepage's
  three-step wizard landing on this page's own address. The old in-page modal
  that filtered the grid in the browser is gone with it; one way to filter,
  one bar of chips to undo it.
*/
const PAGE_SIZE = 8;

export default function CategoryProductGrid({
  section,
  config,
  products,
  totalProducts,
  zone,
  apiSlug,
  apiSub,
  apiZone,
  apiFilters,
  failed,
}: {
  section: CategorySection;
  config: CategoryConfig;
  products: Product[];
  totalProducts: number;
  zone: Zone | null;
  /** set = products came from the API and Load More may ask it for more */
  apiSlug?: string;
  /** a sub-category page — parent + sub is how the API scopes it */
  apiSub?: string;
  apiZone?: "dhaka" | "bangladesh" | null;
  /** the filter this page was rendered with — carried into every Load More */
  apiFilters?: Record<string, string | undefined>;
  /** the catalogue could not be read at all */
  failed?: boolean;
}) {
  /*
    31 Jul 2026 — the server sends the first two dozen, not the whole
    catalogue. Load More asks for the next page instead of slicing an array
    that already holds everything, so a category with four hundred products
    does not put four hundred cards into the HTML of the page.
  */
  const [extra, setExtra] = useState<Product[]>([]);
  const [nextPage, setNextPage] = useState(2);
  const [loading, setLoading] = useState(false);

  const initial = section.count ?? PAGE_SIZE;

  /*
    ⚠️ THE FILTER BAR MADE THIS NECESSARY — 2 Aug 2026.

    A chip changes the query string in place: the server re-renders
    `products`, but THIS COMPONENT STAYS MOUNTED, and `extra` is still holding
    the pages of the OLD filter. Load More would then have shown red roses
    under "Yellow". So the loaded-so-far pile is keyed to the filter the server
    answered with, and starts again whenever that answer changes.
  */
  const urlKey = apiFilters
    ? ["colour", "tag", "occasion", "recipient", "min", "max", "speed", "sort"]
        .map((k) => apiFilters[k] ?? "")
        .join("|")
    : "";

  const [shown, setShown] = useState(initial);
  const [prevUrlKey, setPrevUrlKey] = useState(urlKey);

  // React's "adjust state during render" pattern — no setState in an effect
  if (urlKey !== prevUrlKey) {
    setPrevUrlKey(urlKey);
    setExtra([]);
    setNextPage(2);
    setShown(initial);
  }

  const list = extra.length ? [...products, ...extra] : products;
  const visible = list.slice(0, shown);

  /*
    More to show if this page is holding some back, OR if the server said the
    category has more than has been fetched. The second half is what makes the
    button keep working past the first two dozen.
  */
  const canFetchMore = Boolean(apiSlug) && list.length < totalProducts;
  const hasMore = shown < list.length || canFetchMore;

  async function loadMore() {
    if (shown < list.length) {
      setShown((n) => n + PAGE_SIZE);
      return;
    }
    if (!apiSlug || loading) return;
    setLoading(true);
    const res = await getShopProducts({
      // the budget slug was already turned into min/max by the page
      ...Object.fromEntries(Object.entries(apiFilters ?? {}).filter(([k]) => k !== "budget")),
      category: apiSlug,
      sub: apiSub,
      zone: apiZone,
      page: nextPage,
      limit: 24,
    });
    setLoading(false);
    if (!res || res.items.length === 0) return;
    setExtra((cur) => [...cur, ...res.items.map(toProduct)]);
    setNextPage((n) => n + 1);
    setShown((n) => n + PAGE_SIZE);
  }

  const zoneLabel = zone === "bangladesh" ? "All Bangladesh" : "Inside Dhaka";

  return (
    <Section tone={section.tone} id="all-products">
      <SectionHead
        eyebrow={section.eyebrow}
        heading={section.heading}
        subheading={`${totalProducts} arrangements, all delivering to ${zoneLabel} today.`}
      />

      {/*
        What is being shown, and how to stop showing it. Only when the products
        came from the API: the offline fallback renders the mock config, where a
        chip would offer to remove a filter that was never applied to anything.
      */}
      {apiSlug && apiFilters && <CategoryFilterBar config={config} filters={apiFilters} />}

      {/*
        Nothing to show, and the two reasons are not the same thing.

        `failed` means the catalogue could not be read — say so plainly and
        offer the phone. Inventing products to fill the space is the one thing
        that must not happen here. Otherwise the category is genuinely empty,
        which is the shop's own state and reads honestly.
      */}
      {visible.length === 0 && (
        <div className="max-w-[520px] mx-auto text-center py-14">
          <p className="font-display text-[20px] text-purple mb-2">
            {failed ? "We can't load the collection right now" : "Nothing here just yet"}
          </p>
          <p className="text-[14.5px] font-light text-body-soft">
            {failed ? (
              <>
                Give us a moment and refresh — or message us on WhatsApp and we&apos;ll
                arrange it by hand.
              </>
            ) : (
              <>
                This collection is being arranged. Try another category, or ask us
                what&apos;s fresh today.
              </>
            )}
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] lg:gap-[26px]">
          {visible.map((p) => (
            <ProductCard key={p.slug} product={p} zone={zone} />
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <div className="flex flex-col items-center gap-3 mt-10">
          <div className="w-[180px] h-[3px] bg-lavender-deep rounded-sm overflow-hidden">
            <i
              className="block h-full bg-orchid rounded-sm transition-all duration-500"
              style={{ width: `${Math.min(100, (visible.length / Math.max(totalProducts, 1)) * 100)}%` }}
            />
          </div>
          <div className="text-[13px] text-body-soft">
            {visible.length} of {totalProducts} {totalProducts === 1 ? "arrangement" : "arrangements"}
          </div>
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="inline-flex items-center gap-[10px] px-11 py-[15px] rounded-full border-[1.5px] border-purple text-purple text-[15px] font-medium whitespace-nowrap cursor-pointer transition-all duration-300 hover:bg-purple hover:text-white hover:shadow-lift disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load More"} <ArrowIcon />
            </button>
          )}
        </div>
      )}
    </Section>
  );
}
