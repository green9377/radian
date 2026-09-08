import type { Zone } from "../_store/useZoneStore";

/*
  Mock product data — simulates what the API will return later.
  Constitution rules applied:
  - Money stored as integers in PAISA (1 taka = 100 paisa)
  - zone: "dhaka" = Inside-Dhaka-only, "both" = ships nationwide
  Flags: best = Best Sellers, exp = 2-hour express, sd = same day, mn = midnight,
         neu = new arrival
*/

export type ProductCategory =
  | "flowers"
  | "cakes"
  | "balloons"
  | "chocolates"
  | "giftboxes"
  | "combos"
  | "plants"
  | "personalised";

export type ProductBadge = "express" | "midnight" | "courier";

export interface Product {
  slug: string;
  name: string;
  pricePaisa: number;
  /** DEC-PRD-035 — the number above is the cheapest variant, so the card
   *  writes "from ৳450" rather than promising it for every colour. */
  priceFrom?: boolean;
  /** the struck-through price while a discount runs, else null */
  mrpPaisa?: number | null;
  /** how that discount was set — the badge reads FLAT as taka, PERCENT as % */
  discountKind?: "FLAT" | "PERCENT" | null;
  /** may it be sold — the same rule the page and the order door use */
  availability?: "IN_STOCK" | "OUT_OF_STOCK" | "PRE_ORDER";
  cat: ProductCategory;
  /** Sub-category slug (e.g. "roses") — the Category FK on the API side */
  sub?: string;
  zone: "dhaka" | "both";
  badge: ProductBadge;
  stars: string;
  meta: string;
  /** the uploaded photograph; null = the shared placeholder */
  imageUrl?: string | null;
  /** legacy gradient — the mock rows still carry one; cards no longer paint it */
  bg: string;
  best?: boolean;
  exp?: boolean;
  sd?: boolean;
  mn?: boolean;
  /** New arrival — read by the category page rail rule */
  neu?: boolean;
  /** Gift Finder tag — occasion (a Product↔Occasion relation on the API side) */
  occ?: Occasion[];
  /** Gift Finder tag — recipient (a Product↔Recipient relation on the API side) */
  rec?: Recipient[];
  /**
   * Advance payment required — COD is off (checkout, `_data/payment.ts`).
   * Made-to-order items: once engraved or printed, a cancellation is the
   * shop's whole loss. Switched per product in the admin (`prepaidOnly`).
   */
  prepaidOnly?: boolean;
}

export type Occasion =
  | "birthday"
  | "anniversary"
  | "love"
  | "congratulations"
  | "get-well"
  | "sorry"
  | "corporate"
  | "just-because";

export type Recipient = "her" | "him" | "parents" | "friend" | "colleague";

/** Format paisa as taka for display: 129000 → "৳ 1,290" */
export function formatTaka(paisa: number): string {
  return "৳ " + (paisa / 100).toLocaleString("en-IN");
}

/** Zone filter: All Bangladesh shows courier-safe (zone "both") products only */
export function zoneFilter(product: Product, zone: Zone | null): boolean {
  return zone === "bangladesh" ? product.zone === "both" : true;
}

/*
  ⚠️ `PRODUCTS` — THE HAND-WRITTEN CATALOGUE — IS GONE (9 Sep 2026).

  Twenty-odd invented bouquets with invented prices lived here, and for months
  they were the fallback under search, collections and the home rails. Every
  one of those screens reads the shop now (`/shop/products`, `/shop/collections`,
  `/shop/search`), so the only thing the file still owes the app is the SHAPE
  of a product, the zone rule and `formatTaka` — which is why the types above
  stay and the data does not.
*/
