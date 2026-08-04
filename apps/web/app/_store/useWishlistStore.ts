"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/*
  ═══════════════════════════════════════════════════════════════════
  WISHLIST STORE — Zustand + persist (localStorage: "radian-wishlist")

  ── কী রাখা হয় ────────────────────────────────────────────────
  শুধু product slug-এর তালিকা। cart-এর মতো config/qty নয়।

  Wishlist = "পরে দেখব বলে product save করা" — product-level, item-config
  নয়। size/variant/bundle বাছাই PDP-তে হয়। আর D16 মতে variant = আলাদা
  slug, তাই slug-ই wishlist-এর পুরো identity।

  দাম/নাম/ছবি এখানে রাখি না (D20-এর একই যুক্তি) — resolveWishlist()
  প্রতি render-এ catalog থেকে জোড়া লাগায়, তাই কখনো stale হয় না।

  ── order ──────────────────────────────────────────────────────
  নতুন save সামনে বসে (unshift) — "সদ্য যোগ করা" আগে দেখানোই স্বাভাবিক।
  ═══════════════════════════════════════════════════════════════════
*/

interface WishlistStore {
  slugs: string[];
  toggle: (slug: string) => void;
  remove: (slug: string) => void;
  clear: () => void;
}

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set) => ({
      slugs: [],

      toggle: (slug) =>
        set((s) =>
          s.slugs.includes(slug)
            ? { slugs: s.slugs.filter((x) => x !== slug) }
            : { slugs: [slug, ...s.slugs] },
        ),

      remove: (slug) =>
        set((s) => ({ slugs: s.slugs.filter((x) => x !== slug) })),

      clear: () => set({ slugs: [] }),
    }),
    {
      name: "radian-wishlist",
    },
  ),
);

/*
  Hydration guard — useCartHydrated-এর হুবহু pattern।
  zustand localStorage first render-এর পরে পড়ে, তাই guard ছাড়া heart-এর
  ভরাট/ফাঁকা অবস্থা server আর client-এ আলাদা হয়ে hydration mismatch দেবে।
*/
export function useWishlistHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useWishlistStore.persist.onFinishHydration(onChange),
    () => useWishlistStore.persist.hasHydrated(),
    () => false,
  );
}

/** একটা product save করা আছে কি না — hydrate না হওয়া পর্যন্ত false */
export function useInWishlist(slug: string): boolean {
  const saved = useWishlistStore((s) => s.slugs.includes(slug));
  const hydrated = useWishlistHydrated();
  return hydrated ? saved : false;
}

/** Header badge — hydrate না হওয়া পর্যন্ত 0 (badge লুকানো থাকে) */
export function useWishlistCount(): number {
  const n = useWishlistStore((s) => s.slugs.length);
  const hydrated = useWishlistHydrated();
  return hydrated ? n : 0;
}
