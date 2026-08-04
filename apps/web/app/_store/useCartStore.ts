"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/*
  ═══════════════════════════════════════════════════════════════════
  CART STORE — Zustand + persist (localStorage: "radian-cart")

  ── কী রাখা হয় ────────────────────────────────────────────────
  শুধু CONFIG। দাম নয়।

  ⚠️ দাম কেন store করা হয় না:
  Admin কাল দাম বদালে cart-এ পুরনো দাম বসে থাকবে, আর checkout-এ
  হঠাৎ অন্য সংখ্যা দেখাবে। তাই cart শুধু "কোন product, কোন config"
  মনে রাখে — দাম প্রতিবার _data/cart.ts → resolveCart() হিসাব করে।

  ── variantSlug কেন নেই ───────────────────────────────────────
  D16: variant (colour/flavour) = আলাদা product, নিজের slug।
  তাই `slug`-ই variant। handbook-এর `variantSlug` field অপ্রয়োজনীয়।

  ── lineId ─────────────────────────────────────────────────────
  slug | sizeId | bundleId | sorted(addons) | persoText | persoImage
  একই key = qty++। আলাদা perso text = আলাদা line — দুই mug-এ দুই নাম
  merge হয়ে গেলে একজনের উপহারে আরেকজনের নাম যাবে।
  ═══════════════════════════════════════════════════════════════════
*/

export const MIN_QTY = 1;
export const MAX_QTY = 20;

export interface CartItem {
  lineId: string;
  /**
   * ⚠️ আগে এই লাইনে লেখা ছিল "variant-ও এই slug-ই (D16)" — পুরনো নকশায়
   * প্রতিটা রঙ ছিল আলাদা product, তাই slug-ই রঙ বলে দিত। DEC-PRD-012-তে
   * রঙগুলো এক product-এর ভেতরে এসেছে, তাই slug আর যথেষ্ট নয়:
   * লাল আর গোলাপি এখন একই slug, আলাদা `variantId`।
   */
  slug: string;
  /**
   * DEC-PRD-012 — কোন রঙ / ফ্লেভার / মাপ। `undefined` = এই product-এর
   * কোনো variant নেই।
   *
   * ⚠️ `lineId`-তেও ঢোকে (নিচে) — নাহলে লাল আর গোলাপি এক line-এ মিশে
   * যেত আর গ্রাহক দুটো লাল পেতেন।
   */
  variantId?: string;
  sizeId: string;
  /**
   * DEC-PRD-013 — যে যে bundle গ্রাহক নিয়েছেন। মালিক, ২ আগস্ট ২০২৬:
   * *"customer একসাথে কয়েকটা bundle নিতে পারবে"*.
   *
   * ⚠️ আগে এটা ছিল একটামাত্র `bundleId`, আর "কিছুই না" মানে ছিল `"none"`
   * নামের একটা বানানো id। এখন খালি array-ই "কিছুই না" — বানানো id-র আর
   * দরকার নেই, আর সেটাই ভালো: `"none"` কখনো কোনো সত্যিকারের সারি ছিল না,
   * শুধু "কিছু বাছা হয়নি" বোঝাতে একটা শব্দ বসানো ছিল।
   *
   * ⚠️ সবসময় sorted — নইলে একই দুটো জিনিস দুই line হয়ে যাবে।
   */
  bundleIds: string[];
  /** সবসময় sorted — নইলে একই জিনিস দুই line হয়ে যাবে */
  addonKeys: string[];
  persoText?: string;
  /** এখন শুধু file name। Upload API এলে এখানে asset id বসবে। */
  persoImage?: string;
  qty: number;
  addedAt: number;
}

/** PDP যা পাঠায় */
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

/** একই lineId দুবার থাকলে qty জোড়া লাগাও */
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
  Identity বদলে দেয় এমন edit (add-on সরানো, size upgrade) — lineId নতুন
  করে বানাতে হবে। আর নতুন key যদি ইতিমধ্যে cart-এ থাকা কোনো line-এর সাথে
  মিলে যায়, দুটো merge হবে (নইলে হুবহু একই দুই line পাশাপাশি বসবে)।
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
   * ★ Coupon — শুধু CODE, discount নয় (D20-এর একই যুক্তি)।
   * Cart-এ apply করলে checkout-এ কোডটা বসেই থাকবে; টাকার অঙ্ক প্রতিবার
   * applyCoupon() হিসাব করবে, তাই subtotal বদলালে discount কখনো stale হবে না।
   */
  couponCode: string | null;
  /** Undo bar — remove করলে ৬ সেকেন্ড এখানে বসে থাকে */
  lastRemoved: RemovedLine | null;

  add: (item: NewCartItem) => void;
  setQty: (lineId: string, qty: number) => void;
  remove: (lineId: string) => void;
  removeAddon: (lineId: string, addonKey: string) => void;
  setSize: (lineId: string, sizeId: string) => void;
  setCoupon: (code: string | null) => void;
  restore: () => void;
  clearRemoved: () => void;
  clear: () => void;
}

export const useCartStore = create<CartStore>()(
  persist<CartStore, [], [], Pick<CartStore, "items" | "couponCode">>(
    (set) => ({
      items: [],
      couponCode: null,
      lastRemoved: null,

      add: (item) =>
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
        }),

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
        set({ couponCode: code ? code.trim().toUpperCase() : null }),

      clear: () => set({ items: [], lastRemoved: null, couponCode: null }),
    }),
    {
      name: "radian-cart",
      version: 3,
      /*
        DEC-PRD-013 — version 2-এ প্রতিটা line-এ একটামাত্র `bundleId` ছিল।
        গ্রাহকের browser-এ সেই পুরনো cart এখনো বসে আছে, আর সেটা না বদলালে
        `[...i.bundleIds]` লাইনে গোটা cart page সাদা হয়ে যেত।

        ⚠️ `"none"` বাদ দেওয়া হয় — ওটা "কিছু বাছা হয়নি"-র জন্য বানানো
        একটা শব্দ ছিল, সত্যিকারের কোনো bundle নয়। সেটা রেখে দিলে cart
        একটা অস্তিত্বহীন bundle খুঁজত আর প্রতিবার না পেয়ে চুপ থাকত।
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
      // lastRemoved persist হবে না — refresh করলে undo bar ফিরে আসা উচিত নয়
      partialize: (s) => ({ items: s.items, couponCode: s.couponCode }),
    },
  ),
);

/*
  Hydration guard — useZoneStore-এর মতোই সমস্যা: zustand localStorage
  পড়ে FIRST RENDER-এর পরে। guard ছাড়া server "0 item" render করবে,
  client সাথে সাথে "3 items" — React hydration mismatch।
*/
export function useCartHydrated(): boolean {
  return useSyncExternalStore(
    // subscribe — hydration শেষ হলে একবার ডাকে
    (onChange) => useCartStore.persist.onFinishHydration(onChange),
    // client snapshot
    () => useCartStore.persist.hasHydrated(),
    // server snapshot — SSR-এ localStorage নেই, তাই সবসময় false
    () => false,
  );
}

/** Header badge — hydrate না হওয়া পর্যন্ত 0 (badge লুকানো থাকে) */
export function useCartCount(): number {
  const items = useCartStore((s) => s.items);
  const hydrated = useCartHydrated();
  return hydrated ? items.reduce((n, i) => n + i.qty, 0) : 0;
}
