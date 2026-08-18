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
  CART RESOLVER — a pure function, no React.

  The cart store holds config only (slug/size/bundle/addon/perso/qty).
  Price, name, photo, zone — all of it is joined on from the catalog here.
  When a price changes, the very next render shows the right one; nothing goes
  stale.

  ⇄ SWAP HERE — the day getProductDetail() becomes a fetch(), this function
  becomes async. No component's shape changes.
  ═══════════════════════════════════════════════════════════════════
*/

export interface ResolvedLine {
  item: CartItem;
  detail: ProductDetail;
  product: Product;
  size: SizeOption;
  /**
   * DEC-PRD-012 — which colour / flavour / size is being bought. `null` = this
   * product has no variants, or the one that was picked has been removed by
   * the owner.
   */
  variant: PickedVariant | null;
  /**
   * DEC-PRD-018 — what was added to this line from the list. Empty = nothing,
   * and then there is no discount either (the owner's rule).
   *
   * ⚠️ Anything the owner has removed is not here — the same as with a deleted
   * size. The price moves, and that is the honest signal.
   */
  bundles: BundleOption[];
  addons: AddonItem[];
  /** size + bundle + Σ add-ons — the price of one unit (integer paisa) */
  unitPaisa: number;
  /** unitPaisa × qty */
  linePaisa: number;
  /** zone conflict — a Dhaka-only product while zone = All Bangladesh */
  held: boolean;
  /** size upgrade nudge — the next size up, null when there is none */
  nextSize: SizeOption | null;
}

/** The product is gone from the catalog (deleted/renamed). Not removed
    silently — it is shown. */
export interface MissingLine {
  item: CartItem;
}

export interface CartTotals {
  /** the sum of the deliverable lines — this is what goes to checkout */
  activePaisa: number;
  /** the sum of the held lines — not in the subtotal, shown only */
  heldPaisa: number;
  activeQty: number;
  heldQty: number;
  /** every line (held included) — the header badge and "· N items" */
  totalQty: number;
  deliveryFromPaisa: number;
}

export interface ResolvedCart {
  /** deliverable right now */
  lines: ResolvedLine[];
  /** zone conflict — still in the cart, not deleted, just out of the subtotal */
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
      A fallback when the size/bundle does not match — so a cart line does not
      crash when the admin deletes a size. The price is then the default
      config's, and whatever the UI shows is what the user pays. Once Ecommerce
      is locked the API will report this with a 410.
    */
    const size = detail.sizes.find((s) => s.id === item.sizeId) ?? detail.sizes[0];

    /*
      DEC-PRD-012 — the cart holds only the id; price and photo are fetched
      fresh every time.

      ⚠️ `null` on a miss, and then the product's own price governs — exactly
      as with a deleted size. So a customer's cart does not fall apart when the
      owner removes a colour; the price moves, and that is the honest signal.
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

    /*  When the variant has its own price, that is the base — the exact same
        condition as PdpView, so what was seen on the page is what lands in the
        cart.  */
    const variantPaisa =
      variant && variant.pricePaisa !== detail.product.pricePaisa ? variant.pricePaisa : null;

    /*  DEC-PRD-018 — exactly what the page showed is what the cart shows. The
        same function in `bundlePricing.ts` does the arithmetic, so there is no
        route to two answers in two places.

        ⚠️ Add-ons (cards, ribbons) stay outside the discount — they are not
        items on the list, and the owner's discount sits under the list.  */
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
   "A little something extra?" — one tap, no configuration.
   So only products whose default config is enough: cheap, needing no
   personalisation, and deliverable in the current zone.
*/
const XSELL_CATS: Product["cat"][] = ["chocolates", "balloons", "giftboxes"];
const XSELL_MAX_PAISA = 120000; // under ৳1,200 — an impulse buy

export interface CrossSellItem {
  slug: string;
  name: string;
  bg: string;
  /** what it costs in the default config — exactly what lands after adding */
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
      /*  default = the first size and no bundle → the price equals the card's.
          ⚠️ This used to hunt for a "zero price" bundle, because a bundle had
          to be picked. Picking nothing is the normal state now.  */
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
