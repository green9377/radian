import type { CartItem } from "../_store/useCartStore";
import type { Zone } from "../_store/useZoneStore";
import { type Product } from "./products";
import { getShopProducts, zoneCode } from "./shop";
import {
  type AddonItem,
  type BundleOption,
  type PickedVariant,
  type ProductDetail,
  type SizeOption,
} from "./productDetails";
import { fetchAddons, fetchProductDetail } from "./productApi";
import { bundleTotals } from "./bundlePricing";
import { DELIVERY_FROM_PAISA } from "./delivery";

/*
  ═══════════════════════════════════════════════════════════════════
  CART RESOLVER — pure function, কোনো React নেই।

  Cart store শুধু config রাখে (slug/size/bundle/addon/perso/qty)।
  দাম, নাম, ছবি, zone — সব এখানে catalog থেকে জোড়া লাগে।
  দাম বদলালে পরের render-এই ঠিক দাম দেখাবে, stale হবে না।

  ⇄ SWAP HERE — getProductDetail() যেদিন fetch() হবে, এই function
  async হবে। component-এর shape বদলাবে না।
  ═══════════════════════════════════════════════════════════════════
*/

export interface ResolvedLine {
  item: CartItem;
  detail: ProductDetail;
  product: Product;
  size: SizeOption;
  /**
   * DEC-PRD-012 — কোন রঙ / ফ্লেভার / মাপ কেনা হচ্ছে। `null` = এই
   * product-এর variant নেই, বা যেটা বাছা ছিল সেটা মালিক তুলে দিয়েছেন।
   */
  variant: PickedVariant | null;
  /**
   * DEC-PRD-018 — তালিকা থেকে যা যা এই line-এ যোগ হয়েছে। খালি = কিছুই না,
   * আর তখন ছাড়ও নেই (মালিকের নিয়ম)।
   *
   * ⚠️ যেগুলো মালিক তুলে দিয়েছেন সেগুলো এখানে থাকে না — মুছে ফেলা size-এর
   * বেলায় যা হয়, তাই। দাম নড়ে, আর সেটাই সৎ সংকেত।
   */
  bundles: BundleOption[];
  addons: AddonItem[];
  /** size + bundle + Σ add-on — এক unit-এর দাম (integer paisa) */
  unitPaisa: number;
  /** unitPaisa × qty */
  linePaisa: number;
  /** zone conflict — Dhaka-only পণ্য কিন্তু zone = All Bangladesh */
  held: boolean;
  /** size upgrade nudge — পরের বড় size, না থাকলে null */
  nextSize: SizeOption | null;
}

/** Catalog থেকে product-টা উধাও (delete/rename)। চুপচাপ মুছি না — দেখাই। */
export interface MissingLine {
  item: CartItem;
}

export interface CartTotals {
  /** deliverable line গুলোর যোগফল — এটাই checkout-এ যাবে */
  activePaisa: number;
  /** held line গুলোর যোগফল — subtotal-এ নেই, শুধু দেখানোর জন্য */
  heldPaisa: number;
  activeQty: number;
  heldQty: number;
  /** সব line (held সহ) — Header badge আর "· N items" */
  totalQty: number;
  deliveryFromPaisa: number;
}

export interface ResolvedCart {
  /** এখন deliver করা যাবে */
  lines: ResolvedLine[];
  /** zone conflict — cart-এ আছে, delete হয়নি, শুধু subtotal থেকে বাদ */
  held: ResolvedLine[];
  missing: MissingLine[];
  totals: CartTotals;
  isEmpty: boolean;
}

/*
  ⚠️ `promo` USED TO BE HERE, 3 Aug 2026 — a ৳3,000 free-delivery bar computed
  from `FREE_DELIVERY_PROMO`, a constant in `_data/promo.ts`.

  It is REMOVED rather than merely left unused. A resolver that still hands out
  a threshold nobody can change is a second answer waiting for the next screen
  to pick it up, and this file's own header is about exactly that danger. The
  bar now comes from `nextReward` on the server's quote, read off the Offer
  masters — so the owner creating, editing or ending that offer changes what
  the cart says, which was never true before.
*/

/*
  ⇄ THE SWAP, taken 31 Jul 2026 — exactly as the header above predicted.

  `getProductDetail()` was the mock. It is now `fetchProductDetail()`, and this
  function is async. Nothing about what a component RECEIVES changed; two of
  them (`CartView`, `CheckoutView`) changed how they ask for it, from `useMemo`
  to a fetch in an effect.

  WHAT THIS IS AND IS NOT. It connects the cart's READS — real products, real
  prices, real add-ons. It does not touch anything about placing an order:
  advance rules, zone rules, slots, offer application, stock. Those are
  business rules, Ecommerce is not locked in the architecture project, and the
  storefront audit put the money pages out of scope for that reason.

  ⚠️ ONE REQUEST PER LINE, run in parallel. A three-item cart is three requests.
  Acceptable for a cart, which is small by nature and looked at once; if carts
  grow the answer is a `?slugs=` batch endpoint, not a cache here that would go
  stale against the price it is supposed to keep current.
*/
export async function resolveCart(
  items: CartItem[],
  zone: Zone | null,
): Promise<ResolvedCart> {
  const lines: ResolvedLine[] = [];
  const held: ResolvedLine[] = [];
  const missing: MissingLine[] = [];

  /*
    Add-ons for the whole cart in ONE request rather than one per line: the
    same greeting card may be ticked on three products, and its price must be
    the same on all three lines of the same screen.
  */
  const allAddonKeys = [...new Set(items.flatMap((i) => i.addonKeys))];
  const [details, addonList] = await Promise.all([
    Promise.all(items.map((i) => fetchProductDetail(i.slug))),
    fetchAddons(allAddonKeys),
  ]);
  const addonByKey = new Map(addonList.map((a) => [a.key, a]));

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const detail = details[i];
    if (!detail) {
      missing.push({ item });
      continue;
    }

    /*
      size/bundle না মিললে fallback — admin size delete করলে cart line
      যেন crash না করে। দাম তখন default config-এর, আর UI-তে যা দেখাবে
      সেটাই user দেবে। Ecommerce lock হলে API এটা 410 দিয়ে জানাবে।
    */
    const size = detail.sizes.find((s) => s.id === item.sizeId) ?? detail.sizes[0];

    /*
      DEC-PRD-012 — cart-এ শুধু id থাকে, দাম-ছবি প্রতিবার নতুন করে আসে।

      ⚠️ না মিললে `null`, আর তখন product-এর নিজের দামই চলে — ঠিক যেমন
      মুছে ফেলা size-এর বেলায় হয়। মালিক একটা রঙ তুলে দিলে গ্রাহকের cart
      যেন ভেঙে না পড়ে; দাম নড়ে, আর সেটাই সৎ সংকেত।
    */
    const variant = (detail.variants ?? []).find((v) => v.id === item.variantId) ?? null;
    const bundles = item.bundleIds
      .map((id) => detail.bundles.find((b) => b.id === id))
      .filter((b): b is BundleOption => b !== undefined);

    /*  An add-on the shop no longer has simply is not in the answer, and the
        line loses it — the same thing that happens to a deleted size. Silent,
        but the total moves, which is the honest signal.  */
    const addons = item.addonKeys
      .map((k) => addonByKey.get(k))
      .filter((a): a is AddonItem => a !== undefined);

    /*  variant-এর নিজের দাম থাকলে সেটাই base — PdpView-এর সাথে হুবহু একই
        শর্ত, তাই page-এ যা দেখা গেছে cart-এও সেটাই বসে।  */
    const variantPaisa =
      variant && variant.pricePaisa !== detail.product.pricePaisa ? variant.pricePaisa : null;

    /*  DEC-PRD-018 — page-এ যা দেখানো হয়েছিল, cart-এও হুবহু তাই। হিসাবটা
        `bundlePricing.ts`-এর একই function করে, তাই দুই জায়গায় দুই উত্তর
        হওয়ার পথ নেই।

        ⚠️ add-on (card, ফিতে) ছাড়ের বাইরে থাকে — সেগুলো তালিকার জিনিস
        নয়, আর মালিকের ছাড়টা তালিকার নিচে বসানো।  */
    const unitPaisa =
      bundleTotals(variantPaisa ?? size.pricePaisa, detail.bundle, item.bundleIds).totalPaisa +
      addons.reduce((n, a) => n + a.pricePaisa, 0);

    const sizeIdx = detail.sizes.findIndex((s) => s.id === size.id);

    const line: ResolvedLine = {
      item,
      detail,
      product: detail.product,
      size,
      variant,
      bundles,
      addons,
      unitPaisa,
      linePaisa: unitPaisa * item.qty,
      held: zone === "bangladesh" && detail.product.zone === "dhaka",
      nextSize: detail.sizes[sizeIdx + 1] ?? null,
    };

    (line.held ? held : lines).push(line);
  }

  const activePaisa = lines.reduce((n, l) => n + l.linePaisa, 0);
  const heldPaisa = held.reduce((n, l) => n + l.linePaisa, 0);
  const activeQty = lines.reduce((n, l) => n + l.item.qty, 0);
  const heldQty = held.reduce((n, l) => n + l.item.qty, 0);

  const totals: CartTotals = {
    activePaisa,
    heldPaisa,
    activeQty,
    heldQty,
    totalQty: activeQty + heldQty,
    deliveryFromPaisa:
      DELIVERY_FROM_PAISA[zone === "bangladesh" ? "bangladesh" : "dhaka"],
  };

  return {
    lines,
    held,
    missing,
    totals,
    isEmpty: items.length === 0,
  };
}

/* ─────────────────── CROSS-SELL ───────────────────
   "A little something extra?" — এক tap, কোনো configuration নেই।
   তাই শুধু সেই product যেগুলোর default config-ই যথেষ্ট: সস্তা,
   personalisation লাগে না, আর current zone-এ deliver হয়।
*/
const XSELL_CATS: Product["cat"][] = ["chocolates", "balloons", "giftboxes"];
const XSELL_MAX_PAISA = 120000; // ৳1,200-এর নিচে — impulse buy

export interface CrossSellItem {
  slug: string;
  name: string;
  bg: string;
  /** default config-এ যা দাম পড়বে — যোগ করার পর ঠিক এটাই বসবে */
  pricePaisa: number;
  sizeId: string;
  bundleIds: string[];
}

/*
  ⚠️ ASYNC, AND IT FETCHES TWICE ON PURPOSE, 31 Jul 2026.

  It used to read the mock catalogue, which on a live shop meant offering four
  chocolate boxes nobody stocks — with an "Add" button that worked.

  The first call finds cheap candidates. The second reads each survivor's
  detail, because this rail's promise is ONE TAP: the price on the card must be
  the price that lands in the cart. Size ids come from the database now, so
  guessing "std" would add the item at whatever the first size happens to cost
  and quietly disagree with the number the shopper just read.

  Four extra requests on a page that already makes one per line. If that ever
  matters, the answer is a default-config field on the card endpoint, not a
  guess here.
*/
export async function crossSellItems(
  inCart: CartItem[],
  zone: Zone | null,
  limit = 4,
): Promise<CrossSellItem[]> {
  const have = new Set(inCart.map((i) => i.slug));

  const res = await getShopProducts({
    max: XSELL_MAX_PAISA / 100,
    sort: "popular",
    limit: 24,
    zone: zoneCode(zone),
  });
  if (!res) return [];

  const candidates = res.items
    .filter((p) => !have.has(p.slug) && XSELL_CATS.includes(p.cat as Product["cat"]))
    .sort((a, b) => a.pricePaisa - b.pricePaisa)
    .slice(0, limit);

  const details = await Promise.all(candidates.map((p) => fetchProductDetail(p.slug)));

  return candidates
    .map((p, i) => {
      const d = details[i];
      if (!d) return null;
      /*  default = প্রথম size, কোনো bundle নয় → দাম card-এর দামের সমান।
          ⚠️ আগে এখানে "দাম শূন্য" bundle খোঁজা হতো, কারণ একটা bundle
          বাছতেই হতো। এখন কিছু না বাছাই স্বাভাবিক অবস্থা।  */
      const size = d.sizes[0];
      return {
        slug: p.slug,
        name: p.name,
        bg: p.imageUrl ? `url(${p.imageUrl}) center/cover` : p.bg,
        pricePaisa: size?.pricePaisa ?? p.pricePaisa,
        sizeId: size?.id ?? "",
        /*  `as string[]` — an empty literal infers `never[]`, and then this
            whole list stops being a CrossSellItem[] and the filter below
            cannot narrow it. No behaviour here, only the word for it.  */
        bundleIds: [] as string[],
      };
    })
    .filter((x): x is CrossSellItem => x !== null);
}
