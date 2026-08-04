import {
  ProductType,
  ProductZone,
  NatureType,
  DiscountType,
  AdvanceType,
  StockMode,
  SoldOutMode,
} from '@prisma/client';

/* child input shapes (Product owns) — সব দাম paisa integer */
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
   * DEC-PRD-030 — নিজের আপলোড করা icon-এর ঠিকানা। ভরা থাকলে `icon`-এর
   * জায়গা নেয়।
   *
   * ⚠️ কলামটা ২ আগস্ট থেকেই ছিল, কিন্তু এই DTO-তে না থাকায় কখনো লেখা
   * হয়নি। ধরা পড়ল যখন category-র badge product-এ কপি করার পথ বানানো
   * হলো: মালিকের upload করা icon কপি হয়ে stock icon-এ নেমে যেত।
   */
  iconUrl?: string | null;
  label: string;
  sub?: string;
  sortOrder?: number;
}

/** DEC-PRD-012 — এক product-এর একটা variant */
export interface ProductVariantInput {
  /** Variants & options master-এর মান (লাল / চকলেট / ২ কেজি) */
  variantValueId: string;
  /** নিজের ছবি। খালি = product-এর মূল ছবিই থাকে। */
  imageUrl?: string | null;
  /** নিজের মজুদ — হাতে গোনা (Manual)। Inventory-তে থাকলে `itemId` চলে। */
  stockQty?: number;
  /**
   * DEC-PRD-015 — এই রঙের নিজের stockroom Item। `null` = নিজের Item নেই,
   * তখন product-এর Item-ই ধরা হয়। id দিয়ে, SKU লেখা দিয়ে নয় (DEC-ITM-021)।
   */
  itemId?: string | null;
  /** ঐচ্ছিক। `null` = product-এর মূল দাম — মালিকের নিয়ম, রঙে এক দাম। */
  pricePaisa?: number | null;
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
   * DEC-PDP-09 — মজুদ শূন্য হলে কী হবে। মালিক প্রতি product-এ ঠিক করেন;
   * product type থেকে আন্দাজ করা হয় না।
   */
  soldOutMode?: SoldOutMode;
  /**
   * PRE_ORDER হলে মালিকের লেখা "Expected back on"। ISO date string in, `null`
   * clears it. lead time থেকে হিসাব করা হয় না — মালিক নিজে লিখে দেন।
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
   * DEC-PRD-028 — ছাড়টা কবে থেকে কবে পর্যন্ত। ISO date string, `null` = খালি।
   * দুটোই খালি মানে ছাড় এখনই চলছে, শেষ নেই (আগের আচরণ)।
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

  // sales counter (seed only; auto +1 Sales module-এ)
  salesCount?: number;

  /**
   * DEC-PRD-025 — প্রতি সময়ের নিজের শুরুর সংখ্যা, আর কোনটা এখন চলবে।
   * দেখানো সংখ্যা = ওই সময়ের seed + ওই সময়ের সত্যিকারের order।
   */
  salesSeedToday?: number;
  salesSeedWeek?: number;
  salesSeedMonth?: number;
  salesSeedAll?: number;
  salesWindow?: 'TODAY' | 'WEEK' | 'MONTH' | 'ALL';

  /**
   * DEC-PRD-026 — গ্রাহক এই product-এ নিজের লেখা বা ছবি দিতে পারবে কি না।
   * দুটোই বন্ধ থাকলে product page-এ ওই অংশটাই আঁকা হয় না।
   */
  persoTitle?: string | null;
  persoText?: boolean;
  persoTextLabel?: string | null;
  persoTextMax?: number | null;
  persoTextHint?: string | null;
  persoImage?: boolean;
  persoImageLabel?: string | null;
  persoImageHint?: string | null;

  /** DEC-PRD-027 — "Want this customised?" সবুজ বাক্স, product-প্রতি */
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
   * DEC-PRD-012 — এই product-এর রঙ / ফ্লেভার / মাপগুলো, প্রতিটার নিজের ছবি,
   * মজুদ আর (ঐচ্ছিক) দাম নিয়ে।
   *
   * ⚠️ `undefined` = form কিছু বলেনি, আগেরগুলো থাক। `[]` = মালিক সব তুলে
   * দিয়েছেন, তখন product-টার কোনো variant নেই আর page-এ ওই অংশটাই দেখা
   * যায় না। দুটো আলাদা রাখতেই হবে — নাহলে "সব তুলে দেওয়া" কখনো save হবে না,
   * ঠিক যেভাবে ১ আগস্টে ছবি হারিয়ে যাচ্ছিল।
   */
  variants?: ProductVariantInput[];

  /**
   * DEC-DLV-008 — কোন কোন delivery-তে এই product যেতে পারে, id দিয়ে।
   * নামগুলো Delivery module-এর, আর সংযোগ id-র — লেখার নয়।
   *
   * ⚠️ `undefined` = form কিছু বলেনি, আগেরটাই থাক। `[]` = মালিক সব তুলে
   * দিয়েছেন, তখন product শুধু schedule করা দিনে যাবে। দুটো আলাদা রাখতেই
   * হবে, নাহলে "সব তুলে দেওয়া" কখনো save হবে না।
   */
  deliveryTypeIds?: string[];

  /**
   * ⚠️ পুরনো তিনটা — DEC-DLV-008-এর পর `deliveryTypeIds`-ই আসল উত্তর।
   * এগুলো এখনো লেখা হয় শুধু storefront-এর জন্য, যতক্ষণ না সেটা নতুন
   * টেবিলে সরে (ধাপ ৪)। তারপর এই তিনটা লাইনই মুছে যাবে।
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

  actorName?: string; // audit: কে করছে
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
