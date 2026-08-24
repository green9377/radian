import {
  ProductType,
  ProductZone,
  NatureType,
  DiscountType,
  AdvanceType,
  StockMode,
  SoldOutMode,
} from '@prisma/client';

/* child input shapes (Product owns) — every price is a paisa integer */
export interface ProductImageInput {
  url: string;
  sortOrder?: number;
}
export interface ProductSizeInput {
  label: string;
  sub?: string;
  pricePaisa: number;
  sortOrder?: number;
}
export interface ProductSpecInput {
  item: string;
  qty: string;
  sortOrder?: number;
}
export interface ProductFaqInput {
  question: string;
  answer: string;
  sortOrder?: number;
}
export interface ProductTrustBadgeInput {
  icon: string;
  /**
   * DEC-PRD-030 — the address of an uploaded icon. When filled it takes the
   * place of `icon`.
   *
   * ⚠️ The column existed from 2 August, but it was missing from this DTO, so
   * it was never written. It surfaced while building the path that copies a
   * category's badge onto a product: the owner's uploaded icon came down the
   * wire as a stock icon.
   */
  iconUrl?: string | null;
  label: string;
  sub?: string;
  sortOrder?: number;
}

/** DEC-PRD-012 / DEC-PRD-045 — one thing a product can be sold as */
export interface ProductVariantInput {
  /**
   * The LEAD value — the first axis, the one the row is filed under.
   * Kept because every read that predates DEC-PRD-045 goes through it.
   */
  variantValueId: string;
  /**
   * DEC-PRD-045 — every value in this combination, the lead one included.
   * ["Medium", "Red"] is one thing to sell, with one price and one stock.
   *
   * Missing or empty means a plain single-axis row, and then it is read as
   * `[variantValueId]` — which is exactly what every product saved before
   * 23 August 2026 sends.
   */
  valueIds?: string[];
  /** Its own photo. Blank leaves the product's main photo in place. */
  imageUrl?: string | null;
  /** Its own stock, counted by hand (Manual). With Inventory, `itemId` rules. */
  stockQty?: number;
  /**
   * DEC-PRD-015 — this combination's own stockroom Item. `null` means it has
   * none, and then the product's own Item is used. By id, never by SKU text
   * (DEC-ITM-021).
   */
  itemId?: string | null;
  /** Optional. `null` = the product's own price — the owner's rule: a colour
   *  change keeps the price, a size or flavour change need not. */
  pricePaisa?: number | null;
  /** DEC-PRD-032 — this row's own discount. PERCENT = basis points, FLAT = paisa. */
  discountType?: 'NONE' | 'FLAT' | 'PERCENT';
  discountValue?: number;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateProductDto {
  slug: string;
  sku?: string; // staff-facing short code (ROSE-78)
  name: string;
  categoryId: string;
  brandId?: string; // optional single FK — Brand master (DEC-PRD-008)
  unitId?: string; // display unit — what the headline price is quoted in (DEC-PRD-009)
  /**
   * DEC-ITM-002 — the Item this listing resolves to. Set when the product's
   * stock is TRACKED, because that is the moment the listing has to point at
   * something the stockroom actually counts.
   *
   * ⚠️ An ID, never a SKU string. DEC-ITM-021 is explicit: Product and Item
   * keep SEPARATE codes and are joined by this FK, "NEVER by matching SKU
   * text". Matching on text would silently attach a listing to the wrong
   * stock the first time two codes looked alike.
   *
   * `null` clears the link; `undefined` leaves it alone.
   */
  itemId?: string | null;

  /* ── who provides it, and what the page says about how many ────────────── */

  /** THE VENDOR. Set = we stock none of this; they make it on order. Not the
   *  same field as `Item.supplierId` — see the migration's note. */
  supplierId?: string | null;
  /** the number the website shows instead of the real one. null = show real. */
  displayQty?: number | null;
  /** how long one takes to make, in minutes. null = nothing to make, so it
   *  costs the workshop no time and never fills a day. */
  makeMinutes?: number | null;
  /**
   * DEC-PDP-09 — what happens when stock reaches zero. The owner decides it
   * per product; it is never guessed from the product type.
   */
  soldOutMode?: SoldOutMode;
  /**
   * On PRE_ORDER, the "Expected back on" the owner wrote. ISO date string in,
   * `null` clears it. Never worked out from lead time — he types it himself.
   */
  preorderDate?: string | null;
  tagIds?: string[];

  productType: ProductType;
  zone: ProductZone;
  natureType: NatureType;
  natureLabel?: string;

  shortDesc?: string;
  typeText?: string;
  videoId?: string;
  nationwideMsg?: string;

  // SEO-D01 — written either here (while adding the product) or later from
  // Marketing → SEO. Same six columns either way.
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  noIndex?: boolean;

  // pricing — paisa
  costPaisa: number;
  sellingPricePaisa: number;
  discountType?: DiscountType;
  discountValue?: number; // FLAT=paisa; PERCENT=basis points (1000=10%)
  /**
   * DEC-PRD-028 — from when to when the discount runs. ISO date string,
   * `null` = blank. Both blank means it is running now with no end — the
   * behaviour that came before these two columns.
   */
  discountStartsAt?: string | null;
  discountEndsAt?: string | null;

  // payment override
  advanceRequired?: boolean;
  advanceType?: AdvanceType;
  advancePercent?: number;
  advanceAmountPaisa?: number;

  // stock
  stockMode?: StockMode;
  stockQty?: number;
  showStock?: boolean;

  // sales counter (seed only; the Sales module adds +1 by itself)
  salesCount?: number;

  /**
   * DEC-PRD-025 — a starting number per window, and which window is showing.
   * What the page displays = that window's seed + that window's real orders.
   */
  salesSeedToday?: number;
  salesSeedWeek?: number;
  salesSeedMonth?: number;
  salesSeedAll?: number;
  salesWindow?: 'TODAY' | 'WEEK' | 'MONTH' | 'ALL';

  /**
   * DEC-PRD-026 — whether the customer may add their own words or photo to
   * this product. With both off, that part of the product page is not drawn
   * at all.
   */
  persoTitle?: string | null;
  persoText?: boolean;
  persoTextLabel?: string | null;
  persoTextMax?: number | null;
  persoTextHint?: string | null;
  /** DEC-PRD-048 — must the customer fill this in before buying */
  persoTextRequired?: boolean;
  persoImage?: boolean;
  persoImageLabel?: string | null;
  persoImageHint?: string | null;
  /** DEC-PRD-048 — must the customer upload before buying */
  persoImageRequired?: boolean;

  /** DEC-PRD-027 — the green "Want this customised?" box, per product */
  customiseOn?: boolean;
  customiseTitle?: string | null;
  customiseSub?: string | null;

  // made-to-order lead time (CRAFTED)
  leadTimeDays?: number;

  // upgrade link — this product is a bigger version of another
  upgradeOfProductId?: string;
  upgradeSortOrder?: number;

  // manually pinned add-on groups (besides the automatic rules)
  manualAddOnGroupIds?: string[];

  // variant
  variantGroupId?: string;
  variantLabel?: string;
  variantSwatch?: string;

  /**
   * The colour, chosen from the Variant & Option master — D-CAT-01.
   *
   * ⚠️ An ID, never a word. `variantLabel`/`variantSwatch` above are the old
   * typed-in pair and are on their way out: they cannot be filtered on, so
   * "show me the red ones" was impossible until this existed. Send null to
   * clear it; a product with no colour simply never appears in a colour grid.
   */
  variantValueId?: string | null;

  /**
   * DEC-PRD-012 / DEC-PRD-045 — everything this product can be sold as, each
   * with its own photo, its own stock and (optionally) its own price.
   *
   * ⚠️ `undefined` = the form said nothing, so leave what is there. `[]` =
   * the owner removed them all, and then the product has no variants and that
   * part of the page is not drawn. The two must stay apart — otherwise
   * "removed them all" would never save, exactly the way photos were being
   * lost on 1 August.
   */
  variants?: ProductVariantInput[];

  /**
   * DEC-DLV-008 — which deliveries this product can go on, by id. The names
   * belong to the Delivery module, and the link is by id, never by text.
   *
   * ⚠️ `undefined` = the form said nothing, leave what is there. `[]` = the
   * owner removed them all, and then the product only goes on a scheduled
   * day. The two must stay apart, or "removed them all" would never save.
   */
  deliveryTypeIds?: string[];

  /**
   * ⚠️ The old three. Since DEC-DLV-008 the real answer is `deliveryTypeIds`.
   * These are still written, only for the storefront, until it moves onto the
   * new table (step 4). Then all three lines go.
   */
  supportsExpress?: boolean;
  supportsSameDay?: boolean;
  supportsMidnight?: boolean;

  // merchandising
  isPublished?: boolean;
  isBestSeller?: boolean;
  isNewArrival?: boolean;

  // children
  images?: ProductImageInput[];
  sizes?: ProductSizeInput[];
  specRows?: ProductSpecInput[];
  faqs?: ProductFaqInput[];
  trustBadges?: ProductTrustBadgeInput[];

  actorName?: string; // audit: who is doing it
}

export type UpdateProductDto = Partial<CreateProductDto>;

export interface ListProductQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  categoryId?: string;
  productType?: string;
  zone?: string;
  published?: string; // "true" | "false"
}
