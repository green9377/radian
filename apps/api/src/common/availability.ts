/* ═══════════════════════════════════════════════════════════════════════════
   AVAILABILITY — one rule, no home module

   ⚠️ WHY THIS FILE EXISTS AND NOT `shop/product-detail.ts`. The rule was born
   there, but Sales needs it too, and Sales importing a storefront controller
   to find out whether it may take an order is backwards — it drags the whole
   `/shop` surface into the order path and invites a cycle. The rule is pure:
   given a product row, may it be sold, and in what words. It belongs to
   nobody, so it sits in `common/`.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────────────────────
   IS IT BUYABLE — DEC-PDP-09, owner's ruling 1 Aug 2026, clarified 4 Sep 2026

   The rule, in the owner's words (4 Sep 2026): stock is kept either by hand
   (MANUAL) or through the Inventory connection (TRACKED); in BOTH cases, when
   the sellable count reaches 0 the website says "Out of stock" and a normal
   order is refused — unless the product carries the one switch
   `allowOrderAtZero`, in which case a normal order is still accepted. No
   recipe / component / buildable arithmetic, and CRAFTED is not a stock rule.
   Pre-order (`soldOutMode`) is untouched: with the switch off and stock at 0 it
   still decides between a closed door and a later date.

   ⚠️ ONE FUNCTION, ON PURPOSE. The website, the cart and the order endpoint
   must all answer this question the same way. A page that says "Out of stock"
   over a button that still works is worse than no gate at all, and that is
   exactly what happens the day two places disagree.

   ⚠️ WHAT THIS RULE CANNOT DO TODAY. Under DEC-MOD-003 stock falls at Delivery
   Processing, NOT at order confirmation. So `stockQty` still reads 1 while ten
   confirmed orders wait on that last item, and all ten pass this gate. The gate
   shuts — late. Fixing it properly needs a `reservedQty` counter (raised at
   confirm, lowered at delivery) so this line can read `stockQty - reservedQty`;
   that leaves DEC-MOD-003 untouched but it is a Sales/Delivery change and is
   NOT approved yet. Flagged to the owner, unresolved. Do not paper over it here.

   TRACKED products: the count lives in Inventory, so the CALLER resolves it
   and passes `inventoryQty`. Until 4 Sep they were never gated ("stockQty is
   not the truth for them"), which was right about the number and wrong about
   the outcome — a count of 0 in Inventory is still 0. A caller that cannot
   resolve the number leaves `inventoryQty` undefined and gets the old answer
   (IN_STOCK), so nothing is refused on a guess.

   Vendor products (`supplierId` set) are not gated — nothing of theirs sits in
   our warehouse, so our count means nothing about what they can send. Unchanged.
─────────────────────────────────────────────────────────────────────────── */
export type Availability =
  | { state: 'IN_STOCK' }
  | { state: 'OUT_OF_STOCK' }
  /** buyable, but the shopper is told. `backOn` is null when the owner left the
   *  date blank, or wrote one that has already gone past. */
  | { state: 'PRE_ORDER'; backOn: string | null };

export function availabilityOf(p: {
  stockMode: 'MANUAL' | 'TRACKED';
  stockQty: number;
  supplierId: string | null;
  soldOutMode: 'STOCK_OUT' | 'PRE_ORDER';
  preorderDate: Date | null;
  /** "Allow order when stock is 0" — the owner's switch (4 Sep 2026). Absent = off. */
  allowOrderAtZero?: boolean;
  /**
   * TRACKED only: the live Inventory count for the product's own Item, whole
   * units, resolved by the caller. `undefined` = the caller could not look, and
   * then the product is not gated (the pre-4 Sep behaviour); `null` = it looked
   * and there is no stock row, which counts as 0.
   */
  inventoryQty?: number | null;
  /**
   * DEC-PRD-014 — the stock of this product's variants. Owner, 2 Aug 2026:
   * "with variants, the variants' stock rules; the product's own box then
   * only shows the sum."
   *
   * Leave it `undefined` (or empty) for a product without variants and the
   * product's own count decides, as before.
   */
  variantStock?: number[];
  /** DEC-PRD-032 — any variant linked to a stockroom Item whose count the
   *  caller could NOT resolve (its truth lives in Inventory). A caller that
   *  did resolve it puts the number in `variantStock` and leaves this off. */
  hasTrackedVariant?: boolean;
}): Availability {
  if (p.supplierId !== null) return { state: 'IN_STOCK' };

  /*
    DEC-PRD-014 — with variants, the variants ARE the count (owner, 2 Aug 2026).

    ⚠️ R1, 4 Sep 2026 — the "all zero means the boxes were never filled, so
    the product's own box decides" fallback is GONE. It let the shop sell a
    colour whose shelf read 0 (the product box said 500) and Preparing then
    refused the same line against the same shelf — two gates, two answers,
    and a customer told "yes" and then "no". Preparing has always judged a
    variant line against ITS shelf (REV-M4); this gate now says the same thing
    at the door. The owner's ruling: if every variant is 0, nothing is sold.
  */
  const variantStock = p.variantStock ?? [];
  let sellable: number | undefined;
  if (variantStock.length > 0) {
    if (p.hasTrackedVariant) return { state: 'IN_STOCK' }; // a shelf we could not read
    sellable = variantStock.reduce((n, q) => n + q, 0);
  } else if (p.hasTrackedVariant) {
    return { state: 'IN_STOCK' };
  } else if (p.stockMode === 'MANUAL') {
    sellable = p.stockQty;
  } else {
    // TRACKED — the caller's Inventory figure, or "could not look"
    sellable = p.inventoryQty === undefined ? undefined : (p.inventoryQty ?? 0);
  }

  if (sellable === undefined || sellable > 0) return { state: 'IN_STOCK' };

  /*  The owner's switch (4 Sep 2026): at 0, a normal order is still taken.
      Plain IN_STOCK — no pre-order wording, no special money rule; the
      product's own `advanceRequired` applies as it always does.  */
  if (p.allowOrderAtZero) return { state: 'IN_STOCK' };

  if (p.soldOutMode === 'PRE_ORDER') {
    /*  A date in the past is not a promise, it is an embarrassment — the page
        would read "back on 12 July" in August. Silence is the honest fallback. */
    const future =
      p.preorderDate && p.preorderDate.getTime() > Date.now()
        ? p.preorderDate.toISOString()
        : null;
    return { state: 'PRE_ORDER', backOn: future };
  }
  return { state: 'OUT_OF_STOCK' };
}

/** the one place that decides whether an order line may be created at all */
export const isBuyable = (a: Availability) => a.state !== 'OUT_OF_STOCK';
