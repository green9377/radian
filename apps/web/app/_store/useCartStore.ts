"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { track } from "../_data/tracking";

/*
  ═══════════════════════════════════════════════════════════════════
  CART STORE — Zustand + persist (localStorage: "radian-cart")

  ── WHAT IS KEPT ──────────────────────────────────────────────
  CONFIG only. Not prices.

  ⚠️ Why prices are not stored:
  If the admin changes a price tomorrow, the old price would sit in the cart
  and checkout would suddenly show a different number. So the cart only
  remembers "which product, which config" — the price is worked out every time
  by _data/cart.ts → resolveCart().

  ── WHY THERE IS NO variantSlug ───────────────────────────────
  D16: a variant (colour/flavour) = a separate product with its own slug.
  So the `slug` IS the variant. The handbook's `variantSlug` field is
  unnecessary.

  ── lineId ────────────────────────────────────────────────────
  slug | sizeId | bundleId | sorted(addons) | persoText | persoImage
  Same key = qty++. Different perso text = a different line — merge two mugs
  carrying two names and one person's gift goes out with the other's name on
  it.
  ═══════════════════════════════════════════════════════════════════
*/

export const MIN_QTY = 1;
export const MAX_QTY = 20;

export interface CartItem {
  lineId: string;
  /**
   * ⚠️ This line used to read "the variant is this slug too (D16)" — in the
   * old design every colour was a separate product, so the slug told you the
   * colour. Under DEC-PRD-012 the colours moved inside one product, so the
   * slug is no longer enough: red and pink now share a slug and differ by
   * `variantId`.
   */
  slug: string;
  /**
   * DEC-PRD-012 — which colour / flavour / size. `undefined` = this product
   * has no variants.
   *
   * ⚠️ It goes into `lineId` too (below) — otherwise red and pink would merge
   * into one line and the customer would receive two reds.
   */
  variantId?: string;
  sizeId: string;
  /**
   * DEC-PRD-013 — which bundles the customer took. Owner, 2 Aug 2026
   * (translated): *"the customer will be able to take several bundles at
   * once"*.
   *
   * ⚠️ This used to be a single `bundleId`, and "none" meant an invented id
   * called `"none"`. An empty array is now "none" — the invented id is no
   * longer needed, and that is better: `"none"` was never a real row, just a
   * word put there to mean "nothing was picked".
   *
   * ⚠️ Always sorted — otherwise two identical things become two lines.
   */
  bundleIds: string[];
  /** always sorted — otherwise the same thing becomes two lines */
  addonKeys: string[];
  persoText?: string;
  /** just a file name for now. When the upload API lands, an asset id goes here. */
  persoImage?: string;
  qty: number;
  addedAt: number;
}

/** what the PDP sends */
export type NewCartItem = Omit<CartItem, "lineId" | "addedAt">;

type Identity = Omit<CartItem, "lineId" | "addedAt" | "qty">;

export function makeLineId(i: Identity): string {
  return [
    i.slug,
    i.variantId ?? "",
    i.sizeId,
    [...i.bundleIds].sort().join("+"),
    [...i.addonKeys].sort().join("+"),
    i.persoText ?? "",
    i.persoImage ?? "",
  ].join("|");
}

function clampQty(q: number): number {
  return Math.max(MIN_QTY, Math.min(MAX_QTY, Math.round(q)));
}

/** if the same lineId appears twice, add the quantities together */
function mergeDupes(items: CartItem[]): CartItem[] {
  const out: CartItem[] = [];
  for (const it of items) {
    const hit = out.find((x) => x.lineId === it.lineId);
    if (hit) hit.qty = clampQty(hit.qty + it.qty);
    else out.push({ ...it });
  }
  return out;
}

/*
  An edit that changes the identity (removing an add-on, upgrading a size)
  needs a freshly built lineId. And if the new key matches a line already in
  the cart, the two merge (otherwise two identical lines would sit side by
  side).
*/
function rekey(
  items: CartItem[],
  lineId: string,
  patch: (it: CartItem) => CartItem,
): CartItem[] {
  const idx = items.findIndex((x) => x.lineId === lineId);
  if (idx < 0) return items;

  const next = patch(items[idx]);
  const addonKeys = [...next.addonKeys].sort();
  const updated: CartItem = { ...next, addonKeys, lineId: makeLineId({ ...next, addonKeys }) };

  const out = [...items];
  out[idx] = updated;
  return mergeDupes(out);
}

interface RemovedLine {
  item: CartItem;
  index: number;
}

interface CartStore {
  items: CartItem[];
  /**
   * ★ Coupon — the CODE only, never the discount (D20's reasoning again).
   * Applying it in the cart leaves the code in place through checkout; the
   * money is worked out by applyCoupon() every time, so the discount can never
   * go stale when the subtotal changes.
   */
  couponCode: string | null;
  /**
   * R3 (4 Sep 2026) — a code the SHOP has just turned down, kept only so the
   * screen can still say why. The code itself is gone from `couponCode` the
   * moment the quote refuses it: a refused code used to stay in the store,
   * ride into the order payload and block the whole checkout with a 400 —
   * and there was no button to take it out. Not persisted.
   */
  couponRejected: { code: string; reason: string } | null;
  /** Undo bar — a removed line sits here for 6 seconds */
  lastRemoved: RemovedLine | null;

  add: (item: NewCartItem) => void;
  setQty: (lineId: string, qty: number) => void;
  remove: (lineId: string) => void;
  removeAddon: (lineId: string, addonKey: string) => void;
  setSize: (lineId: string, sizeId: string) => void;
  setCoupon: (code: string | null) => void;
  /** R3 — the quote said no to `code`: drop it, remember why */
  rejectCoupon: (code: string, reason: string) => void;
  restore: () => void;
  clearRemoved: () => void;
  clear: () => void;
  /*  DEC-WA-004 — the `/cart/{leadId}` page restores an abandoned basket.
      ⚠️ This replaces, it does not `add` — otherwise opening an old link twice
      would double everything. The page asks first, then calls.  */
  replaceAll: (items: CartItem[]) => void;
}

export const useCartStore = create<CartStore>()(
  persist<CartStore, [], [], Pick<CartStore, "items" | "couponCode">>(
    (set) => ({
      items: [],
      couponCode: null,
      couponRejected: null,
      lastRemoved: null,

      add: (item) => {
        track("AddToCart", { content_id: item.slug, quantity: item.qty });
        set((s) => {
          const addonKeys = [...item.addonKeys].sort();
          const lineId = makeLineId({ ...item, addonKeys });
          const idx = s.items.findIndex((x) => x.lineId === lineId);

          if (idx >= 0) {
            const items = [...s.items];
            items[idx] = { ...items[idx], qty: clampQty(items[idx].qty + item.qty) };
            return { items };
          }

          return {
            items: [
              ...s.items,
              { ...item, addonKeys, lineId, qty: clampQty(item.qty), addedAt: Date.now() },
            ],
          };
        });
      },

      setQty: (lineId, qty) =>
        set((s) => ({
          items: s.items.map((x) =>
            x.lineId === lineId ? { ...x, qty: clampQty(qty) } : x,
          ),
        })),

      remove: (lineId) =>
        set((s) => {
          const index = s.items.findIndex((x) => x.lineId === lineId);
          if (index < 0) return {};
          return {
            items: s.items.filter((x) => x.lineId !== lineId),
            lastRemoved: { item: s.items[index], index },
          };
        }),

      restore: () =>
        set((s) => {
          if (!s.lastRemoved) return {};
          const items = [...s.items];
          items.splice(Math.min(s.lastRemoved.index, items.length), 0, s.lastRemoved.item);
          return { items: mergeDupes(items), lastRemoved: null };
        }),

      clearRemoved: () => set({ lastRemoved: null }),

      removeAddon: (lineId, addonKey) =>
        set((s) => ({
          items: rekey(s.items, lineId, (it) => ({
            ...it,
            addonKeys: it.addonKeys.filter((k) => k !== addonKey),
          })),
        })),

      setSize: (lineId, sizeId) =>
        set((s) => ({
          items: rekey(s.items, lineId, (it) => ({ ...it, sizeId })),
        })),

      setCoupon: (code) =>
        set({ couponCode: code ? code.trim().toUpperCase() : null, couponRejected: null }),

      rejectCoupon: (code, reason) =>
        set((s) =>
          s.couponCode === code.trim().toUpperCase()
            ? { couponCode: null, couponRejected: { code: s.couponCode, reason } }
            : {},
        ),

      clear: () => set({ items: [], lastRemoved: null, couponCode: null, couponRejected: null }),

      replaceAll: (items) => set({ items, lastRemoved: null }),
    }),
    {
      name: "radian-cart",
      version: 3,
      /*
        DEC-PRD-013 — in version 2 each line had a single `bundleId`. That old
        cart is still sitting in customers' browsers, and without migrating it
        the `[...i.bundleIds]` line turned the whole cart page white.

        ⚠️ `"none"` is dropped — it was a word invented to mean "nothing was
        picked", not a real bundle. Keeping it would have the cart looking for
        a bundle that does not exist and silently failing every time.
      */
      migrate: (state, from) => {
        const s = state as { items?: (CartItem & { bundleId?: string })[] };
        if (from < 3 && Array.isArray(s.items)) {
          for (const it of s.items) {
            if (!Array.isArray(it.bundleIds)) {
              it.bundleIds = it.bundleId && it.bundleId !== "none" ? [it.bundleId] : [];
            }
            delete it.bundleId;
          }
        }
        return state as never;
      },
      // lastRemoved is not persisted — the undo bar should not come back on refresh
      partialize: (s) => ({ items: s.items, couponCode: s.couponCode }),
    },
  ),
);

/*
  Hydration guard — the same problem as useZoneStore: zustand reads
  localStorage AFTER the first render. Without the guard the server renders
  "0 items" and the client immediately says "3 items" — a React hydration
  mismatch.
*/
export function useCartHydrated(): boolean {
  return useSyncExternalStore(
    // subscribe — called once when hydration finishes
    (onChange) => useCartStore.persist.onFinishHydration(onChange),
    // client snapshot
    () => useCartStore.persist.hasHydrated(),
    // server snapshot — there is no localStorage in SSR, so always false
    () => false,
  );
}

/** Header badge — 0 until hydrated (the badge stays hidden) */
export function useCartCount(): number {
  const items = useCartStore((s) => s.items);
  const hydrated = useCartHydrated();
  return hydrated ? items.reduce((n, i) => n + i.qty, 0) : 0;
}
