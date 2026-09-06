import type { BundleList } from "./bundlePricing";
import type { Product } from "./products";

/*
  ═══════════════════════════════════════════════════════════════════
  PDP shapes — the types every product-page component reads.

  The hand-written catalogue that used to live here (eight category templates,
  71 products, add-on lists, static offers — 1,200 lines) is gone (owner,
  6 Sep 2026). The page reads the shop through `productApi.ts` and nothing
  else; a slug the shop does not publish is a 404, never a mock bouquet.

  ── VARIANT MODEL (locked) ──────────────────────────────────────
    1. COLOUR  → a separate product (its own slug, photos, stock).
    2. SIZE    → the same product at a different price.
    3. BUNDLE  → another product is added (+ Chocolates / + Cake).
  price = (colour/size price + chosen bundle items) − the list's discount
          + add-ons — the maths lives in `bundlePricing.ts` (DEC-PRD-018)
  ═══════════════════════════════════════════════════════════════════
*/

export type IconName =
  | "bolt" | "sun" | "moon" | "truck" | "shield" | "star" | "leaf"
  | "sparkle" | "gift" | "store" | "clock" | "pen" | "check" | "chev"
  | "cart" | "heart" | "tag" | "play" | "upload" | "wa" | "search"
  /* added for checkout */
  | "user" | "pin" | "camera" | "lock" | "phone" | "eye-off";

/**
 * The same names, as a runtime list.
 *
 * ⚠️ NEEDED BECAUSE THE ADMIN CAN TYPE ANYTHING. `ProductTrustBadge.icon` is a
 * plain String column, so a trust badge can arrive carrying "rocket" — a name
 * `PdpIcons` has no drawing for, which renders an empty square where the
 * shop's largest promise should be. `asIconName()` turns an unknown name into
 * a visible-but-neutral one instead of a hole.
 *
 * Add an icon to the union above and it must be added here too, in the same
 * commit — the same "add it in both" note the shop icon set already carries.
 */
export const ICON_NAMES: readonly IconName[] = [
  "bolt", "sun", "moon", "truck", "shield", "star", "leaf",
  "sparkle", "gift", "store", "clock", "pen", "check", "chev",
  "cart", "heart", "tag", "play", "upload", "wa", "search",
  "user", "pin", "camera", "lock", "phone", "eye-off",
];

export const asIconName = (v: string | null | undefined): IconName =>
  ICON_NAMES.includes(v as IconName) ? (v as IconName) : "check";

export interface TrustItem {
  icon: IconName;
  /**
   * DEC-PRD-023 — an icon the shop uploaded itself. When this is filled it is
   * what gets drawn, and `icon` is not touched at all.
   *
   * ⚠️ Owner, 2 Aug (translated): *"on the trust badge I can't make any custom
   * icon at all"* — before this, only one of twenty built-in names could be
   * picked.
   */
  iconUrl?: string | null;
  label: string;
  sub: string;
}

/*
  1. VARIANT — the same thing with one attribute different → a separate
     product. Colour and Flavour are the same thing: own photos, own stock, own
     SEO page. The only difference is in the showing — colour = a colour
     swatch, flavour = a photo pill.
     ⚠️ Once the Ecommerce module is locked this becomes a
     Product.variantGroupId FK.
*/
export type VariantKind = "colour" | "flavour";

export interface VariantOption {
  slug: string;
  label: string;
  /** hex for colour, a gradient for flavour (until the photos arrive) */
  swatch: string;
  active: boolean;
}

export interface VariantGroup {
  kind: VariantKind;
  label: string;
  options: VariantOption[];
}

/**
 * DEC-PRD-012 — a variant that lives inside one page.
 *
 * ⚠️ Not to be confused with `VariantGroup` above. That is the old design:
 * every colour a separate product, clicking a swatch goes to another page.
 * Clicking here goes **nowhere** — the photos, price and stock change on the
 * same page.
 *
 * Owner, 1 Aug 2026 (translated): *"when it has multiple variants we'll show
 * them, and it will be on one product page. Each with its own image and
 * stock."*
 */
/** DEC-PRD-045 — one value inside a combination */
export interface VariantPart {
  valueId: string;
  label: string;
  /** "Size" / "Colour" — the heading of the row this button belongs in */
  attribute: string;
  attributeId: string;
  displayMode: string;
  swatch: string | null;
  imageUrl: string | null;
}

export interface PickedVariant {
  /** the ProductVariant row's id — this is what goes into the cart */
  id: string;
  /**
   * DEC-PRD-045 — the values this one is made of. One part for a plain colour
   * product; two for "Medium × Red", and then the page draws one row of
   * buttons per list instead of one flat row of nine.
   */
  parts?: VariantPart[];
  label: string;
  /** "Colour" / "Flavour" / "Weight" — sits in the heading */
  attribute: string;
  /** what the master asked to show — SWATCH | PHOTO | TEXT */
  displayMode: string;
  swatch: string | null;
  imageUrl: string | null;
  /** what the customer pays — the offer price when there is one */
  pricePaisa: number;
  /** DEC-PRD-032 — the struck-through price while an offer runs, else null */
  wasPaisa?: number | null;
  /** how that discount was set — the badge reads FLAT as taka, PERCENT as % */
  discountKind?: "FLAT" | "PERCENT" | null;
  /** 0 = this colour is out; the others carry on */
  stockQty: number;
  /** R1 — the shop's own verdict on this option, made beside `availability`.
   *  Absent on the mock, where nothing can run out. */
  soldOut?: boolean;
}

/** 2. SIZE — the same product at a different price */
export interface SizeOption {
  id: string;
  label: string;
  sub?: string;
  pricePaisa: number;
}

/**
 * 3. BUNDLE — another product is added. DEC-PRD-018.
 *
 * ⚠️ This is **one item** on the list, not a package. The owner puts 3–4 on
 * the list and the customer takes whichever they like. The discount is not
 * here — there is a single one for the whole list, and it lives on
 * `ProductDetail.bundle`.
 *
 * ⚠️ `addPaisa` is gone. It meant "how much taking this adds", but the
 * discount applies to the total including the main item — so "how much it
 * adds" depends on what else the customer took. A constant number would have
 * been a lie most of the time.
 */
export interface BundleOption {
  /** id of the product being added — this is what goes into the cart */
  id: string;
  label: string;
  /** what this would cost today bought on its own */
  pricePaisa: number;
  bg: string;
  tag?: string;
  best?: boolean;
}

export interface PersoField {
  type: "text" | "upload";
  label: string;
  placeholder?: string;
  max?: number;
  hint: string;
  /**
   * DEC-PRD-048 — must it be filled in before buying. The page printed the
   * word "required" with nothing behind it and the buttons worked anyway;
   * now it is the shop's switch, and both the buttons and the server obey.
   */
  required?: boolean;
}

export interface Perso {
  title: string;
  fields: PersoField[];
}

export interface SpecRow {
  item: string;
  qty: string;
}

export interface CraftPoint {
  icon: IconName;
  title: string;
  text: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface ProductDetail {
  product: Product;
  crumb: { catLabel: string; catSlug: string; subLabel: string; short: string };
  /** `label` null = the shop wrote no nature line; the chip is not drawn */
  nature: { type: "fresh" | "artificial"; label: string | null };
  /** DEC-PRD-031 — the one line under the title. Write nothing and no line appears. */
  shortDesc: string | null;
  /**
   * The green line above the price — "30–120 Min Delivery".
   *
   * ⚠️ NULLABLE since 1 Aug 2026. A product that can take none of the fast
   * options has nothing true to say here, and an empty chip is better than a
   * confident wrong one.
   */
  deliveryChip: string | null;
  gallery: string[];
  videoId?: string;
  trust: TrustItem[];
  variant: VariantGroup | null;
  /**
   * DEC-PRD-012 — the colours / flavours / sizes this product comes in.
   *
   * Empty or absent = this product has no variants, and then that section is
   * not drawn on the page at all — the owner's rule, "if there is none, don't
   * show it at all".
   *
   * ⚠️ Optional because the mock does not have it. Absent and empty carry the
   * same meaning here — both are "nothing to show".
   */
  variants?: PickedVariant[];
  sizes: SizeOption[];
  sizeLabel: string;
  bundles: BundleOption[];
  /**
   * DEC-PRD-018 — a single discount for the whole list. `null` = no discount.
   *
   * ⚠️ The discount is not on each card, there is one under the list — the
   * owner's rule. Without this, `bundles` is only a list of names and no price
   * can be worked out.
   */
  bundle?: BundleList | null;
  /**
   * DEC-PRD-020 — bigger versions of this one. Owner, 2 Aug 2026 (translated):
   * *"clicking an upgrade product should change the price, but it must not
   * take you to another page."*
   *
   * ⚠️ Each one is a **real product** — its own price, its own stock, its own
   * page. So picking one sends that product's slug to the cart; the page only
   * changes the price and the photos.
   */
  upgrades?: { slug: string; name: string; pricePaisa: number; bg: string }[];
  /**
   * DEC-PRD-024 — what the owner writes in the Search & sharing tab.
   *
   * ⚠️ Until 2 Aug 2026 these six fields **reached nowhere**. They could be
   * typed in the admin, the API did send them, but the product page's
   * `generateMetadata` never read them — it built the title itself from the
   * name and one fixed sentence. The owner asked (translated): *"is this page
   * connected to Google? Will it be published on Google the way I write it?"*
   * — there was no answer. Now there is: yes.
   *
   * There are fallbacks below when these are left empty, so no field is
   * required.
   */
  seo?: {
    title: string | null;
    description: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImageUrl: string | null;
    noIndex: boolean;
  };
  perso: Perso | null;
  /**
   * DEC-PRD-027 — the green "Want this customised?" box. `null`/absent = not
   * shown.
   *
   * ⚠️ This used to be `custom` — hand-written copy on the category template,
   * and it showed on **every** product. The phone number was invented too.
   * Now it is a per-product switch, and the number comes from Company
   * settings.
   */
  customise?: { title: string; sub: string; whatsapp: string | null } | null;
  spec: SpecRow[];
  craft: CraftPoint[];
  /** DEC-WEB-011 — the heading over the promise band. Blank = no heading. */
  craftTitle?: string | null;
  /** DEC-WEB-011 — the small line above it. Blank = none drawn. */
  craftKicker?: string | null;
  faqs: Faq[];
  /** the shop's own sentence for a Dhaka-only gift seen from outside Dhaka; null = none */
  ozReason: string | null;
  /**
   * ⚠️ THREE FIELDS TURNED NULLABLE, 31 Jul 2026 — they were never optional in
   * the mock because the mock always had an answer. The database does not.
   *
   * `rating` / `live`: every one of the 71 products carried a hard-coded
   * "4.9 · 412 reviews". A product nobody has reviewed now says nothing at all
   * rather than borrowing someone else's stars.
   */
  reviews: {
    rating: string | null;
    count: number;
    live: string | null;
    byStar?: number[];
    items?: {
      id: string; authorName: string; rating: number; body: string;
      context: string | null; imageUrl: string | null;
      verifiedPurchase: boolean;
      /** DEC-WEB-007 — the shop's reply, shown under the review */
      replyText?: string | null; replyAt?: string | null;
      createdAt: string;
    }[];
  };
  /**
   * The struck-through price, from the owner's real discount. `null` or absent
   * means nothing is off and the page draws no strike-through.
   *
   * ⚠️ It replaces `unitPaisa / 0.81`, which printed "19% OFF" on all 71
   * products whether or not anything had ever been discounted.
   */
  mrpPaisa?: number | null;
  /** how the product's discount was set; the page shows it that one way */
  discountKind?: "FLAT" | "PERCENT" | null;
  /** DEC-PRD-042 — the offer's own window, so the page can say when it ends */
  offer?: {
    endsAtMs: number | null;
    startsAtMs: number | null;
    percentOff: number;
  } | null;
  /** DEC-PRD-035 — the headline is the cheapest variant, so the page writes
   *  "from ৳450" until a colour is picked. */
  priceFrom?: boolean;
  /**
   * "stick", "kg" — printed small after the price: "৳2,400 / stick".
   *
   * Absent on most products, and that is right: a bouquet sold "per piece"
   * says nothing, a rose sold "per stick" explains the price.
   */
  unitSuffix?: string | null;
  /**
   * "Days before it can go out" — how long the shop needs to make this.
   *
   * ⚠️ ADDED 1 Aug 2026 BECAUSE IT WAS MISSING AND NOBODY KNEW. The API had
   * been sending `leadTimeDays` since the product endpoint was written, but it
   * stopped here — the web's own type never carried it, so no component could
   * have used it even by accident. A 3-day bouquet was offered 2-hour express.
   *
   * Read at checkout only: it decides the earliest date and which delivery
   * methods are possible. `0`/absent means it is on a shelf and can go today.
   */
  leadTimeDays?: number | null;
  /**
   * DEC-PRD-050 — the two merchandising badges, worked out on the server.
   *
   * They are EARNED, never typed: best seller is the top slice of this
   * product's own category by real delivered sales over the last 90 days, and
   * new arrival is a date question about when it went live. Both windows and
   * the percentage are set in admin.
   *
   * Absent → treat as false. Only the mock omits them.
   */
  bestSeller?: boolean;
  /** the category it is a best seller IN — "Best seller in Fresh Flowers" */
  bestSellerIn?: string | null;
  newArrival?: boolean;
  /**
   * Which fast-delivery options this product can actually take, inside Dhaka.
   * Straight from the three tick-boxes on the admin's Delivery tab.
   *
   * ⚠️ ADDED 1 Aug 2026 — SAME STORY AS `leadTimeDays`. The API had been
   * sending `supportsExpress` / `supportsSameDay` / `supportsMidnight` since
   * the endpoint was written, and the ONLY thing reading them was the listing
   * card, to decide which delivery-filter page a product appears on. The
   * product page ignored them and printed "30–120 Min Delivery" on every Dhaka
   * product; checkout ignored them too, so a cream cake with midnight
   * deliberately unticked could still be ordered for midnight.
   *
   * Absent → treat as all allowed. Only the mock omits it.
   */
  speeds?: { express: boolean; sameDay: boolean; midnight: boolean };
  /**
   * How many are left — but ONLY when the shop chose to publish it.
   *
   * `null` means either "we are not telling" or "nothing is counted". The page
   * cannot tell those apart and does not need to: both mean say nothing.
   */
  stockLeft?: number | null;
  /**
   * DEC-PDP-09 — may they buy it at all, and in what words. Decided on the
   * server; the page only renders the answer.
   *
   * ⚠️ NOT DERIVED FROM `stockLeft`. That number is a selling line the shop is
   * free to make up (see "Show a different number" in the admin), and a
   * made-up figure must never be able to open or close the till. The server
   * works this out from the real count.
   *
   * Absent → treat as in stock. Only the mock omits it, and the mock has no
   * stock to run out of.
   */
  availability?:
    | { state: "IN_STOCK" }
    | { state: "OUT_OF_STOCK" }
    /** buyable, but they are told. `backOn` null = no date was promised. */
    | { state: "PRE_ORDER"; backOn: string | null };
  /**
   * Minutes to today's order cut-off, per zone. Worked out on the server in
   * Bangladesh time — the browser only ticks down from it.
   *
   * ⚠️ It replaces `setHours(18, 0, 0, 0)` in `PdpView`: a 6 PM cut-off
   * invented in the component, counted on the VISITOR'S clock. Wrong for every
   * delivery mode that does not close at six, and wrong by six hours for
   * anyone reading the page from outside Bangladesh.
   *
   * `null` for a zone = nothing left to close today, so no countdown is drawn.
   */
  cutoffMinutesLeft?: { dhaka: number | null; nationwide: number | null };
  /**
   * The "Offers Available" strip, from the Marketing module's live offers.
   *
   * ⚠️ DISPLAY ONLY. Nothing here changes a price on this page — which offer
   * wins, whether they stack and what is actually taken off is decided once,
   * at checkout. Absent means nothing is running, and the strip does not draw.
   */
  offers: Offer[];
  /** DEC-PRD-052 — the reassurance line under Buy Now; null = built-in wording */
  underBuyText?: string | null;
  underBuyPreorderText?: string | null;
  /**
   * "Pairs beautifully with" — full cards, built by the same code as the
   * category grid, so a product looks identical wherever it appears.
   *
   * Empty = the shop has nothing to suggest, and the rail is not drawn.
   */
  crossProducts?: Product[];
  /**
   * "Make It Extra Special" — the tabs, with their add-ons already in them,
   * grouped by the owner's own rules.
   */
  addonGroups: AddonGroup[];
}

export interface AddonGroup {
  id: string;
  label: string;
  items: AddonItem[];
}

/* ─────────────────── ADD-ONS ─────────────────── */
export interface AddonItem {
  key: string;
  name: string;
  pricePaisa: number;
  /**
   * DEC-PRD-049 — the shop gives this one away on purpose. The card says
   * "Free" instead of "+৳ 0", which read as a page that had lost a number.
   * An add-on that is ৳0 WITHOUT this never reaches the page at all — that
   * one is unpriced, not free.
   */
  isFree?: boolean;
  bg: string;
  fromCatalog: boolean;
}


/** the "Offers Available" strip — display only; checkout decides what applies */
export interface Offer {
  logo: string;
  color: string;
  text: string;
  code?: string;
  note?: string;
}

/**
 * A detail that can always be drawn: a product saved with no sizes is normal
 * in the admin and is one "Standard" size on the page; when there is only
 * one option the UI hides the chooser (`PdpView`).
 */
export function guard(d: ProductDetail): ProductDetail {
  if (d.sizes.length === 0) {
    d.sizes = [{ id: "std", label: "Standard", pricePaisa: d.product.pricePaisa }];
  }
  return d;
}
