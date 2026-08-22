"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";

import { useZoneStore } from "../../_store/useZoneStore";
import {
  useWishlistStore,
  useWishlistHydrated,
} from "../../_store/useWishlistStore";
import { resolveWishlist } from "../../_data/wishlist";
import ProductCard from "../Product/ProductCard";

/*
  ═══════════════════════════════════════════════════════════════════
  WISHLIST VIEW — /wishlist এর client অংশ।

  - slug store থেকে, product resolveWishlist() থেকে (দাম fresh)।
  - সব save দেখায়; zone-এ যাবে না এমন item লুকায় না — dim + "Inside Dhaka
    only" ribbon (সোবুজ approved, cart D21-এর 'saved for later' যুক্তি)।
    উপরে summary notice + এক ক্লিকে "Switch to Inside Dhaka"।
  - hydrate না হওয়া পর্যন্ত skeleton — খালি-state flash এড়াতে।
  - খালি হলে EmptyCart-এর মতো friendly state।
  ═══════════════════════════════════════════════════════════════════
*/

function useZoneHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useZoneStore.persist.onFinishHydration(onChange),
    () => useZoneStore.persist.hasHydrated(),
    () => false,
  );
}

function HeartIcon() {
  return (
    <svg className="w-9 h-9 stroke-current fill-none stroke-[1.6]" viewBox="0 0 24 24">
      <path
        d="M12 20.3S4 15 4 9.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8 2.9c0 5.4-8 10.7-8 10.7z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function WishlistView() {
  const slugs = useWishlistStore((s) => s.slugs);
  const clear = useWishlistStore((s) => s.clear);
  const wlHydrated = useWishlistHydrated();

  const zone = useZoneStore((s) => s.zone);
  const setZone = useZoneStore((s) => s.setZone);
  const zoneHydrated = useZoneHydrated();
  const effZone = zoneHydrated ? zone : null;

  const resolved = useMemo(
    () => resolveWishlist(slugs, effZone),
    [slugs, effZone],
  );

  // Hydrate না হওয়া পর্যন্ত skeleton — নইলে খালি-state এক পলকের জন্য দেখা যায়
  if (!wlHydrated) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <span className="text-[13.5px] text-body-soft">Loading…</span>
      </div>
    );
  }

  const { entries, undeliverableCount, isEmpty } = resolved;

  if (isEmpty) {
    return (
      <div className="bg-white border-[1.5px] border-lavender-deep rounded-[24px] px-6 py-14 text-center shadow-soft">
        <span className="w-20 h-20 mx-auto rounded-full bg-lavender grid place-items-center text-orchid">
          <HeartIcon />
        </span>
        <h2 className="font-display text-[24px] text-purple font-semibold mt-5">
          Your wishlist is empty
        </h2>
        <p className="text-[14px] text-body-soft mt-2 max-w-[380px] mx-auto">
          Tap the heart on any product to save it here for later.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-6">
          <Link
            href="/fresh-flowers"
            className="h-[48px] px-7 inline-flex items-center rounded-[14px] bg-purple text-white font-semibold text-[14px] hover:bg-purple-deep transition-colors"
          >
            Shop fresh flowers
          </Link>
          <Link
            href="/search"
            className="h-[48px] px-7 inline-flex items-center rounded-[14px] border-[1.5px] border-purple text-purple font-semibold text-[14px] hover:bg-lavender transition-colors"
          >
            Search gifts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Heading */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display text-[clamp(24px,3vw,34px)] font-medium text-purple leading-[1.15]">
            Your Wishlist
          </h1>
          <p className="text-body-soft mt-1 text-[14px] font-light">
            {entries.length} saved {entries.length === 1 ? "item" : "items"}
          </p>
        </div>
        <button
          onClick={clear}
          className="text-[13px] font-semibold text-body-soft underline hover:text-purple transition-colors cursor-pointer"
        >
          Clear all
        </button>
      </div>

      {/* Zone notice — কিছু save current zone-এ যাবে না */}
      {undeliverableCount > 0 && (
        <div className="flex items-center gap-3 flex-wrap bg-[#FFF7E8] border border-[#F2D9A8] text-[#8A5A00] rounded-[16px] px-4 py-3 mb-6 text-[13.5px]">
          <span>
            <b>
              {undeliverableCount}{" "}
              {undeliverableCount === 1 ? "item" : "items"}
            </b>{" "}
            don&apos;t deliver to All Bangladesh.
          </span>
          <button
            onClick={() => setZone("dhaka")}
            className="ml-auto shrink-0 bg-purple text-white rounded-full px-4 py-[7px] text-[12.5px] font-semibold hover:bg-purple-deep transition-colors cursor-pointer"
          >
            Switch to Inside Dhaka
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] lg:gap-[26px]">
        {entries.map(({ product, deliverable }) =>
          deliverable ? (
            <ProductCard key={product.slug} product={product} zone={effZone} />
          ) : (
            <div key={product.slug} className="relative">
              <span className="absolute top-[13px] left-1/2 -translate-x-1/2 z-[6] bg-[#FFF4E3] text-[#8A5A00] text-[11px] font-semibold rounded-full px-3 py-[5px] whitespace-nowrap shadow-[0_4px_14px_rgba(71,0,102,0.12)]">
                Inside Dhaka only
              </span>
              <div className="opacity-[0.55]">
                <ProductCard product={product} zone={effZone} />
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
