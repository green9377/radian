"use client";

import { useEffect, useState } from "react";
import type { Zone } from "../../_store/useZoneStore";
import type { Product } from "../../_data/products";
import type { CategoryConfig, CategorySection } from "../../_data/categories";
import { getShopProducts } from "../../_data/shop";
import { toProduct } from "../../_data/categoryApi";
import { useGiftFinderStore } from "../../_store/useGiftFinderStore";
import ProductCard from "../Product/ProductCard";
import CategoryFilterBar from "./CategoryFilterBar";
import { ArrowIcon, Section, SectionHead } from "./SectionShell";

/*
  All Products — ২ লাইন (৮টা), তারপর Load More।

  Filter toolbar নেই — Gift Finder-ই সেই কাজটা করে।
  Gift Finder-এর উত্তর এলে এই grid নিজে থেকেই filter হয়ে যায়,
  উপরে একটা result banner বসে, আর Start Over দিয়ে সব ফিরিয়ে আনা যায়।
*/
const PAGE_SIZE = 8;

const RECIPIENT_LABEL: Record<string, string> = {
  her: "her",
  him: "him",
  parents: "your parents",
  friend: "your friend",
  colleague: "your colleague",
};

const OCCASION_LABEL: Record<string, string> = {
  birthday: "birthday",
  anniversary: "anniversary",
  love: "love & romance",
  congratulations: "congratulations",
  "get-well": "get well soon",
  sorry: "saying sorry",
  corporate: "corporate gifting",
  "just-because": "no reason at all",
};

export default function CategoryProductGrid({
  section,
  config,
  products,
  totalProducts,
  zone,
  apiSlug,
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
  apiZone?: "dhaka" | "bangladesh" | null;
  /** the filter this page was rendered with — carried into every Load More */
  apiFilters?: Record<string, string | undefined>;
  /** the catalogue could not be read at all */
  failed?: boolean;
}) {
  const { result, clearResult, openFinder } = useGiftFinderStore();

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
  const filterKey = result
    ? `${result.recipient}|${result.occasion}|${result.minPaisa}`
    : "all";

  /*
    ⚠️ THE FILTER BAR MADE THIS NECESSARY — 2 Aug 2026.

    Until today the query string could only change by leaving the page, so
    everything below could safely be first-page state. Now a chip changes it in
    place: the server re-renders `products`, but THIS COMPONENT STAYS MOUNTED,
    and `extra` is still holding the pages of the OLD filter. Load More would
    then have shown red roses under "Yellow", which is the kind of wrong that
    looks like the shop lying about its own stock.

    So the loaded-so-far pile is keyed to the filter the server answered with,
    and starts again whenever that answer changes.
  */
  const urlKey = apiFilters
    ? `${apiFilters.colour ?? ""}|${apiFilters.tag ?? ""}|${apiFilters.occasion ?? ""}|${apiFilters.min ?? ""}|${apiFilters.max ?? ""}|${apiFilters.speed ?? ""}|${apiFilters.sort ?? ""}`
    : "";

  const [shown, setShown] = useState(initial);
  const [prevKey, setPrevKey] = useState(filterKey);
  const [prevUrlKey, setPrevUrlKey] = useState(urlKey);

  // Gift Finder-এর উত্তর বদলালে grid আবার প্রথম ২ লাইন থেকে শুরু।
  // React-এর "adjust state during render" pattern — effect-এ setState নয়।
  if (filterKey !== prevKey) {
    setPrevKey(filterKey);
    setShown(initial);
  }

  if (urlKey !== prevUrlKey) {
    setPrevUrlKey(urlKey);
    setExtra([]);
    setNextPage(2);
    setShown(initial);
  }

  /*
    The wizard's answers, asked of the server — scoped to this category, which
    is the owner's rule (31 Jul): the homepage wizard searches the shop, a
    category wizard searches the category.

    Two requests at most. The first asks for all three answers; if the shop has
    nothing in that price the second drops the budget, so the page can say
    "nothing sits exactly in that budget — here are five that fit everything
    else" instead of showing an empty grid and no explanation.
  */
  const [finder, setFinder] = useState<{ items: Product[]; total: number; mode: Mode }>({
    items: [],
    total: 0,
    mode: "none",
  });
  const [finderPage, setFinderPage] = useState(2);

  useEffect(() => {
    if (!result || !apiSlug) {
      setFinder({ items: [], total: 0, mode: "none" });
      return;
    }
    let alive = true;
    const base = {
      category: apiSlug,
      zone: apiZone,
      occasion: result.occasion,
      tag: result.recipient,
      limit: 24,
    };
    setLoading(true);
    (async () => {
      const exact = await getShopProducts({
        ...base,
        min: Math.round(result.minPaisa / 100),
        max: Math.round(result.maxPaisa / 100),
      });
      if (!alive) return;
      if (exact && exact.items.length > 0) {
        setFinder({ items: exact.items.map(toProduct), total: exact.total, mode: "exact" });
        setFinderPage(2);
        setLoading(false);
        return;
      }
      const relaxed = await getShopProducts(base);
      if (!alive) return;
      setFinder({
        items: (relaxed?.items ?? []).map(toProduct),
        total: relaxed?.total ?? 0,
        mode: relaxed && relaxed.items.length > 0 ? "relaxed" : "exact",
      });
      setFinderPage(2);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [filterKey, apiSlug, apiZone, result]);

  /* ---- Gift Finder filter ----
  //
  // ⚠️ SCOPE CHANGED 31 Jul 2026, ON THE OWNER'S INSTRUCTION.
  //
  // The wizard used to fall back to the whole shop when a category had no
  // match — "Gift Finder, not Flower Finder". The owner overruled it: on the
  // homepage the wizard searches everything, on a category page it searches
  // THAT CATEGORY ONLY. Somebody standing on Fresh Flowers asking for a
  // birthday gift is asking for flowers.
  //
  // The homepage wizard still sends people to /products with the answers on
  // the query string, so the shop-wide search did not disappear — it lives
  // where it belongs.
  //
  // Two steps remain, both inside the category:
  //   1. exact   — recipient + occasion + budget
  //   2. relaxed — budget dropped, because "nothing in that price" is worth
  //                saying out loud rather than showing an empty page
  */
  type Mode = "none" | "exact" | "relaxed" | "sitewide";

  const loaded = extra.length ? [...products, ...extra] : products;

  let list = loaded;
  let mode: Mode = "none";

  /*
    Connected to the API, the answers are sent to the server instead of being
    applied to the two dozen products this page happens to be holding. Before,
    a match sitting on page 3 of the category was simply invisible — the
    wizard reported "nothing matches" about products it had never seen.
  */
  if (result && apiSlug) {
    list = finder.items;
    mode = finder.mode;
  } else if (result) {
    const matchesTags = (p: Product) =>
      Boolean(p.rec?.includes(result.recipient) && p.occ?.includes(result.occasion));
    const inBudget = (p: Product) =>
      p.pricePaisa >= result.minPaisa && p.pricePaisa <= result.maxPaisa;

    const exact = loaded.filter((p) => matchesTags(p) && inBudget(p));
    if (exact.length) {
      list = exact;
      mode = "exact";
    } else {
      // offline fallback path only, and it stays inside the category too
      const relaxed = loaded.filter(matchesTags);
      list = relaxed;
      mode = relaxed.length ? "relaxed" : "exact";
    }
  }

  const visible = list.slice(0, shown);
  /*
    More to show if this page is holding some back, OR if the server said the
    category has more than has been fetched. The second half is what makes the
    button keep working past the first two dozen.

    Not offered while a Gift Finder answer is on screen: those matches are
    filtered from what is loaded, and a Load More that fetches unfiltered
    products would quietly break the filter the shopper is looking at.
  */
  const canFetchMore = Boolean(apiSlug) && (result ? finder.items.length < finder.total : loaded.length < totalProducts);
  const hasMore = shown < list.length || canFetchMore;

  async function loadMore() {
    if (shown < list.length) {
      setShown((n) => n + PAGE_SIZE);
      return;
    }
    if (!apiSlug || loading) return;
    setLoading(true);

    // with an answer on screen, more means more MATCHES — the same filter,
    // the next page. Fetching unfiltered products here would quietly break
    // the filter the shopper is looking at.
    if (result) {
      const res = await getShopProducts({
        category: apiSlug,
        zone: apiZone,
        occasion: result.occasion,
        tag: result.recipient,
        ...(finder.mode === "exact"
          ? { min: Math.round(result.minPaisa / 100), max: Math.round(result.maxPaisa / 100) }
          : {}),
        page: finderPage,
        limit: 24,
      });
      setLoading(false);
      if (!res || res.items.length === 0) return;
      setFinder((cur) => ({ ...cur, items: [...cur.items, ...res.items.map(toProduct)] }));
      setFinderPage((n) => n + 1);
      setShown((n) => n + PAGE_SIZE);
      return;
    }

    const res = await getShopProducts({
      ...apiFilters,
      category: apiSlug,
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
  // with an answer on screen the count is the number of MATCHES the server
  // found — not how many happen to be loaded, which was the old number and
  // was wrong the moment the category outgrew one page
  const shownTotal = result ? (apiSlug ? finder.total : list.length) : totalProducts;

  return (
    <Section tone={section.tone} id="all-products">
      <SectionHead
        eyebrow={result ? "Picked for you" : section.eyebrow}
        heading={result ? "Your Gift Finder Matches" : section.heading}
        subheading={
          result
            ? undefined
            : `${totalProducts} arrangements, all delivering to ${zoneLabel} today.`
        }
      />

      {/*
        What is being shown, and how to stop showing it.

        Only when the products came from the API: the offline fallback renders
        the mock config, where a chip would offer to remove a filter that was
        never applied to anything.

        Hidden while a Gift Finder answer is on screen — that has its own
        banner with its own "Start over", and two ways to clear two different
        things, side by side, is how a page starts to feel like a form.
      */}
      {apiSlug && !result && apiFilters && (
        <CategoryFilterBar config={config} filters={apiFilters} />
      )}

      {/* ---- Gift Finder result banner ---- */}
      {result && (
        <div className="max-w-[760px] mx-auto -mt-4 mb-9 text-center">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 mb-3">
            <span className="inline-flex items-center gap-2 bg-orchid-soft text-purple rounded-full px-4 py-[7px] text-[12.5px] font-semibold whitespace-nowrap">
              For {RECIPIENT_LABEL[result.recipient]}
            </span>
            <span className="inline-flex items-center gap-2 bg-orchid-soft text-purple rounded-full px-4 py-[7px] text-[12.5px] font-semibold whitespace-nowrap">
              {OCCASION_LABEL[result.occasion]}
            </span>
            <span className="inline-flex items-center gap-2 bg-orchid-soft text-purple rounded-full px-4 py-[7px] text-[12.5px] font-semibold whitespace-nowrap">
              {result.budgetLabel}
            </span>
          </div>

          <p className="text-[14.5px] font-light text-body-soft">
            {list.length === 0 ? (
              <>
                Nothing in {config.label} matches that combination.{" "}
                <button
                  onClick={openFinder}
                  className="font-semibold text-purple underline cursor-pointer"
                >
                  Change your answers
                </button>{" "}
                and we&apos;ll find something.
              </>
            ) : mode === "relaxed" ? (
              <>
                Nothing sits exactly in that budget — here are{" "}
                <b className="text-purple font-semibold">{list.length}</b> that fit everything else.
              </>
            ) : mode === "sitewide" ? (
              <>
                Nothing in {config.label} fits — but{" "}
                <b className="text-purple font-semibold">{list.length}</b> other{" "}
                {list.length === 1 ? "gift" : "gifts"} across Radian{" "}
                {list.length === 1 ? "does" : "do"}.
              </>
            ) : (
              <>
                <b className="text-purple font-semibold">{list.length}</b>{" "}
                {list.length === 1 ? "match" : "matches"}, delivering to {zoneLabel}.
              </>
            )}
          </p>

          <div className="flex items-center justify-center gap-4 mt-3">
            <button
              onClick={openFinder}
              className="text-[13px] font-semibold text-purple hover:text-orchid transition-colors cursor-pointer"
            >
              Change answers
            </button>
            <span className="text-lavender-deep">·</span>
            <button
              onClick={clearResult}
              className="text-[13px] font-semibold text-body-soft underline hover:text-purple transition-colors cursor-pointer"
            >
              Start over — show everything
            </button>
          </div>
        </div>
      )}

      {/*
        Nothing to show, and the two reasons are not the same thing.

        `failed` means the catalogue could not be read — say so plainly and
        offer the phone. Inventing products to fill the space is the one thing
        that must not happen here; a shopper who orders something the shop does
        not have is a refund and a lost customer, not a slightly stale page.

        Otherwise the category is genuinely empty, which is the shop's own
        state and reads honestly.
      */}
      {visible.length === 0 && !result && (
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
              style={{ width: `${Math.min(100, (visible.length / Math.max(shownTotal, 1)) * 100)}%` }}
            />
          </div>
          <div className="text-[13px] text-body-soft">
            {visible.length} of {shownTotal} {shownTotal === 1 ? "arrangement" : "arrangements"}
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
