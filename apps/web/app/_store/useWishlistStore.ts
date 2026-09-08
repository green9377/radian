"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { addWish, getWishlist, removeWish } from "../_data/accountApi";
import { useAuthStore } from "./useAuthStore";

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

  ── SIGNED IN, IT IS THE ACCOUNT'S (owner, 8 Sep 2026) ─────────────
  A guest still keeps a list in this browser — the heart has to work before
  anybody logs in, or nobody ever would. The moment there is a session, the
  same act is also written to `WishlistItem`, and `pullWishlist()` brings the
  account's list back down on sign-in. So a list made on a phone is on the
  laptop, and clearing a browser no longer throws it away.

  ⚠️ The server call is fire-and-forget on purpose: a heart that waits for a
  round trip feels broken, and a failed sync must never lose the local list.
  The next sign-in pushes anything the server missed.
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
        set((s) => {
          const had = s.slugs.includes(slug);
          void syncOne(slug, !had);
          return had
            ? { slugs: s.slugs.filter((x) => x !== slug) }
            : { slugs: [slug, ...s.slugs] };
        }),

      remove: (slug) =>
        set((s) => {
          void syncOne(slug, false);
          return { slugs: s.slugs.filter((x) => x !== slug) };
        }),

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

/* ─────────────────── the account's copy ─────────────────── */

/** one heart, mirrored to the account — silent when signed out or offline */
async function syncOne(slug: string, on: boolean) {
  const token = useAuthStore.getState().token;
  if (!token) return;
  try {
    if (on) await addWish(token, slug);
    else {
      /*  The server keys on the product id, and the browser only knows the
          slug — so the row is found in the account's own list first.  */
      const mine = await getWishlist(token);
      const hit = mine.find((w) => w.slug === slug);
      if (hit) await removeWish(token, hit.productId);
    }
  } catch {
    /* the local list is the customer's; a failed sync must not empty it */
  }
}

/**
 * Sign-in: the account's list becomes this browser's, and anything saved here
 * as a guest is pushed up first so nothing is lost by logging in.
 */
export async function mergeWishlistOnLogin(token: string) {
  const local = useWishlistStore.getState().slugs;
  try {
    for (const slug of local) await addWish(token, slug);
    const mine = await getWishlist(token);
    useWishlistStore.setState({ slugs: mine.map((w) => w.slug) });
  } catch {
    /* leave the local list alone — it is better than an empty one */
  }
}
