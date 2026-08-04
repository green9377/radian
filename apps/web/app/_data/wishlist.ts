import type { Zone } from "../_store/useZoneStore";
import { PRODUCTS, zoneFilter, type Product } from "./products";

/*
  ═══════════════════════════════════════════════════════════════════
  WISHLIST RESOLVER — pure function, কোনো React নেই।

  Store শুধু slug রাখে; এখানে catalog থেকে product জোড়া লাগে (দাম/নাম/ছবি
  সবসময় fresh — D20-এর একই যুক্তি)।

  ── zone (সোবুজ approved) ────────────────────────────────────────
  Wishlist = নিজের save-list, তাই zone দিয়ে কিছু লুকাই না (cart D21-এর
  "saved for later" যুক্তি)। বদলে প্রতিটা item-এ `deliverable` flag বসাই —
  current zone-এ যাবে কি না। UI non-deliverable-এ নোট + হালকা dim দেখায়,
  মিথ্যা delivery প্রতিশ্রুতি দেয় না।

  ── missing ──────────────────────────────────────────────────────
  Catalog-এ আর নেই এমন slug চুপচাপ বাদ (wishlist order নয়, তাই cart-এর
  মতো "no longer available" দেখানোর দরকার নেই)।

  ⇄ SWAP HERE — Ecommerce lock হলে ভেতরটা fetch() হবে; component বদলাবে না।
  ═══════════════════════════════════════════════════════════════════
*/

export interface WishlistEntry {
  product: Product;
  /** current zone-এ deliver করা যায় কি না (§৫ zoneFilter) */
  deliverable: boolean;
}

export interface ResolvedWishlist {
  entries: WishlistEntry[];
  /** current zone-এ যাবে না এমন save-এর সংখ্যা (UI notice-এ) */
  undeliverableCount: number;
  isEmpty: boolean;
}

const BY_SLUG = new Map(PRODUCTS.map((p) => [p.slug, p]));

export function resolveWishlist(
  slugs: string[],
  zone: Zone | null,
): ResolvedWishlist {
  const entries: WishlistEntry[] = [];

  for (const slug of slugs) {
    const product = BY_SLUG.get(slug);
    if (!product) continue; // missing — চুপচাপ বাদ
    entries.push({ product, deliverable: zoneFilter(product, zone) });
  }

  return {
    entries,
    undeliverableCount: entries.filter((e) => !e.deliverable).length,
    isEmpty: entries.length === 0,
  };
}
