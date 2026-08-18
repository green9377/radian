/*
  ═══════════════════════════════════════════════════════════════════════════
  BUNDLE PRICING — DEC-PRD-018, the owner's decision, 2 Aug 2026

  > *"taking just the main product gets no discount, and the moment they select
  >  any extra product from a bundle they get the discount — that is my
  >  concept."* (translated)

  One product, one list, one discount. The owner puts 3–4 items on it; the
  customer takes whichever they like and skips the rest. Taking even one
  applies the discount — to the total **including the main product**.

  ⚠️ There used to be a complicated rule here about "which bundle counts the
  main" (DEC-PRD-017). It came from my asking the wrong question — I had
  assumed a bundle meant separate packages. The owner put me right: it is one
  list. So the rule is gone with it.

  ⚠️ One place, and that is the reason this file exists. The product page shows
  a price, the cart works it out again (because prices can change), checkout
  adds it up. Three calculations in three places and one day the page says
  ৳5,310 while the cart says ৳5,900 — with the customer watching the number
  change at the very moment of paying.

  ⚠️ The discount is not applied on the server because the server does not know
  which ones the customer will take. The raw numbers come from there; applying
  them happens here, once.
  ═══════════════════════════════════════════════════════════════════════════
*/

export type DiscountKind = "NONE" | "FLAT" | "PERCENT";

export interface BundleItem {
  /** id of the product being added — this is what goes to the cart, not the name */
  id: string;
  name: string;
  imageUrl: string | null;
  /** its price today, after its own discount */
  pricePaisa: number;
}

export interface BundleList {
  discountType: DiscountKind;
  /** FLAT = paisa · PERCENT = basis points (1000 = 10%) */
  discountValue: number;
  items: BundleItem[];
}

/**
 * Applying a discount — the same rule everywhere in Radian.
 *
 * ⚠️ PERCENT is in basis points (1000 = 10%), and the division happens once at
 * the end. Multiply by 0.1 instead and ৳1,299 turns into
 * ৳1,169.0999999999999 one day.
 */
export function applyDiscount(paisa: number, type: DiscountKind, value: number): number {
  if (type === "FLAT") return Math.max(0, paisa - value);
  if (type === "PERCENT") return Math.max(0, Math.round((paisa * (10000 - value)) / 10000));
  return paisa;
}

export interface BundleTotals {
  /** main + the picked items, after the discount — the price of one unit */
  totalPaisa: number;
  /** what it would have cost with no discount */
  beforePaisa: number;
  /** how much was saved. 0 = there is no discount, or nothing was picked */
  savePaisa: number;
}

/**
 * @param basePaisa what the customer is paying for the main product — the
 *   price after choosing a colour or size. The discount applies on top of
 *   this, so taking a 2 kg cake makes the discount bigger too.
 * @param pickedIds which ones were taken from the list, by product id.
 */
export function bundleTotals(
  basePaisa: number,
  list: BundleList | null | undefined,
  pickedIds: string[],
): BundleTotals {
  const picked = (list?.items ?? []).filter((i) => pickedIds.includes(i.id));
  const beforePaisa = basePaisa + picked.reduce((n, i) => n + i.pricePaisa, 0);

  /*
    ⚠️ Take nothing, get no discount — the owner's explicit rule: *"taking
    just the main product gets no discount"*. Without this condition the
    discount would apply to the product's price on its own, and then there
    would be no reason to build the list at all.
  */
  if (!list || picked.length === 0) {
    return { totalPaisa: basePaisa, beforePaisa, savePaisa: 0 };
  }

  const totalPaisa = applyDiscount(beforePaisa, list.discountType, list.discountValue);
  return { totalPaisa, beforePaisa, savePaisa: beforePaisa - totalPaisa };
}
