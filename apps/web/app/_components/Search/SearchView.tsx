"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useZoneStore } from "../../_store/useZoneStore";
import { searchProductsLive, popularProductsLive } from "../../_data/search";
import type { Product } from "../../_data/products";
import ProductCard from "../Product/ProductCard";

/*
  ═══════════════════════════════════════════════════════════════════
  SEARCH VIEW — /search?q= এর client অংশ।

  - q আসে URL থেকে (useSearchParams)। খোঁজা হয় header-এর search box দিয়ে
    (sticky, সব page-এ) — তাই এই page নিজে আর box দেখায় না। এক box, এক
    source of truth (সোবুজ: page-এ দ্বিতীয় box অপ্রয়োজনীয়)।
  - matching সব _data/search.ts → searchProducts()-এ; এই component শুধু
    দেখায় (D23 pattern: সংখ্যা/rule component-এ নয়)।
  - ProductCard reuse (এক template), Load More CategoryProductGrid-এর মতোই।
  - খালি ফলাফল = সৎ message + জনপ্রিয় fallback + Gift Finder CTA (approved):
    ফলাফলকে "match" বলে চালানো হয় না (Constitution)।
  ═══════════════════════════════════════════════════════════════════
*/

const PAGE_SIZE = 8;

/* zone hydration guard — useCartHydrated-এর হুবহু pattern।
   localStorage first render-এর পরে পড়া হয়, তাই hydrate না হওয়া পর্যন্ত
   zone null ধরি (SSR আর first client render মেলে, mismatch হয় না)। */
function useZoneHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useZoneStore.persist.onFinishHydration(onChange),
    () => useZoneStore.persist.hasHydrated(),
    () => false,
  );
}

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

export default function SearchView() {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();

  const hydrated = useZoneHydrated();
  const zone = useZoneStore((s) => s.zone);
  const effZone = hydrated ? zone : null;

  const [shown, setShown] = useState(PAGE_SIZE);

  // URL-এর q বদলালে (header submit / back button) grid প্রথম পাতায় reset।
  // effect নয় — CategoryProductGrid-এর "adjust state during render" pattern।
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    setShown(PAGE_SIZE);
  }

  /*
    ═══ LIVE SEARCH — 4 Aug 2026 ═══

    `useMemo(searchProducts)` searched the mock catalogue synchronously: it
    found products the shop does not sell and missed every one it does. Typing
    a real product's exact name said "No matches". Both directions, wrong.

    Now each query asks the shop. `failed` is its own state — a network blip
    must say "couldn't search", never "no matches", because the second one is
    an answer and the first is an apology.
  */
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stale = false;
    if (!q) {
      setResults([]);
      setFailed(false);
      return;
    }
    setSearching(true);
    searchProductsLive(q, effZone).then((r) => {
      if (stale) return;
      setSearching(false);
      if (r === null) {
        setFailed(true);
        setResults([]);
      } else {
        setFailed(false);
        setResults(r);
      }
    });
    return () => {
      stale = true;
    };
  }, [q, effZone]);

  const [popular, setPopular] = useState<Product[]>([]);
  useEffect(() => {
    let stale = false;
    popularProductsLive(effZone).then((r) => {
      if (!stale) setPopular(r);
    });
    return () => {
      stale = true;
    };
  }, [effZone]);

  const zoneLabel = effZone === "bangladesh" ? "All Bangladesh" : "Inside Dhaka";

  const visible = results.slice(0, shown);
  const hasMore = shown < results.length;
  const hasQuery = q.length > 0;
  const empty = hasQuery && !searching && !failed && results.length === 0;

  return (
    <section className="pt-4 pb-4">
      {/* ---- Result heading ---- */}
      {hasQuery && (
        <div className="max-w-[1200px] mx-auto text-center mt-6 mb-7 px-2">
          <h1 className="font-display text-[clamp(22px,3vw,32px)] font-medium text-purple leading-[1.2]">
            {searching ? (
              <>Searching&hellip;</>
            ) : failed ? (
              /*  ব্যর্থতা ≠ শূন্য ফল। "No matches" একটা উত্তর; এটা ক্ষমাপ্রার্থনা।  */
              <>We couldn&apos;t search just now — try again</>
            ) : results.length > 0 ? (
              <>
                {results.length} {results.length === 1 ? "result" : "results"} for
                &nbsp;&ldquo;{q}&rdquo;
              </>
            ) : (
              <>No matches for &ldquo;{q}&rdquo;</>
            )}
          </h1>
          {results.length > 0 && (
            <p className="text-body-soft mt-2 text-[14.5px] font-light">
              Delivering to {zoneLabel}.
            </p>
          )}
        </div>
      )}

      {/* ---- Idle (কোনো query নেই) ---- */}
      {!hasQuery && (
        <div className="max-w-[1200px] mx-auto text-center mt-8 mb-8 px-2">
          <h1 className="font-display text-[clamp(22px,3vw,32px)] font-medium text-purple leading-[1.2]">
            What are you looking for?
          </h1>
          <p className="text-body-soft mt-2 text-[14.5px] font-light">
            Use the search bar above — try &ldquo;roses&rdquo;, &ldquo;birthday
            cake&rdquo; or &ldquo;chocolate&rdquo;. Or browse what&apos;s popular
            below.
          </p>
        </div>
      )}

      {/* ---- Results grid ---- */}
      {visible.length > 0 && (
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
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
        </div>
      )}

      {/* ---- খালি ফলাফল / Idle → জনপ্রিয় fallback + Gift Finder CTA ---- */}
      {(empty || !hasQuery) && (
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 mt-4">
          {empty && (
            <div className="max-w-[620px] mx-auto text-center mb-11">
              <p className="text-[15px] text-body-soft font-light">
                We couldn&apos;t find anything for that. Check the spelling, try a
                shorter word, or let our Gift Finder pick for you.
              </p>
              <Link
                href="/#giftfinder"
                className="inline-flex items-center gap-2 mt-5 px-8 py-[13px] bg-purple text-white rounded-full font-medium text-[15px] transition-all duration-300 hover:bg-purple-deep hover:-translate-y-[2px] hover:shadow-lift cursor-pointer"
              >
                Open Gift Finder 🌸
              </Link>
            </div>
          )}

          {popular.length > 0 && (
            <>
              <div className="text-center mb-7">
                <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase text-orchid font-semibold whitespace-nowrap">
                  <span className="w-[9px] h-[9px] bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
                  Loved by thousands
                </div>
                <h2 className="font-display text-[clamp(20px,2.6vw,28px)] font-medium text-purple leading-[1.2] mt-3">
                  Popular right now
                </h2>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] lg:gap-[26px]">
                {popular.map((p) => (
                  <ProductCard key={p.slug} product={p} zone={effZone} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
