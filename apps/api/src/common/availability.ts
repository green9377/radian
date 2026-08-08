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
   IS IT BUYABLE — DEC-PDP-09, owner's ruling 1 Aug 2026
   "stock 0 হলে order দেওয়া যাবে না। হয় stock out আসবে, বা pre-order আসবে।"

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

   TRACKED products are deliberately not gated: their real count lives in the
   Item/Inventory module, `Product.stockQty` is not the truth for them, and a
   gate reading the wrong number would block sales for no reason.

   Vendor products (`supplierId` set) are not gated either — nothing of theirs
   sits in our warehouse, so our count means nothing about what they can send.
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
  /**
   * DEC-PRD-014 — এই product-এর variant-গুলোর মজুদ। মালিক, ২ আগস্ট ২০২৬:
   * *"variant থাকলে variant-এর stock-ই চলবে, product-এর ঘরটা তখন যোগফল
   * দেখাবে।"*
   *
   * ⚠️ না দিলে (`undefined`) আগের নিয়মই চলে — Sales-এর মতো যেসব জায়গা
   * এখনো variant পড়ে না, তারা যেন হঠাৎ অন্য উত্তর না পায়।
   */
  variantStock?: number[];
  /** DEC-PRD-032 — any variant linked to a stockroom Item (its true count
   *  lives in Inventory, not in a hand-typed box) */
  hasTrackedVariant?: boolean;
}): Availability {
  const counted = p.stockMode === 'MANUAL' && p.supplierId === null;

  /*
    DEC-PRD-014 — variant-ই আসল গোনা।

    ⚠️ কেন যোগফল, আর কেন শর্ত দিয়ে। এক product-এ দুই জায়গায় সংখ্যা
    লেখা যেত — Stock tab-এ একটা, প্রতিটা রঙে একটা। মালিকের ২ আগস্টের
    রায়: variant থাকলে variant-ই চলবে।

    ⚠️ কিন্তু **সবগুলো শূন্য হলে নয়**। ঘরগুলো এখনো ভরা হয়নি এমন হতেই
    পারে, আর তখন হঠাৎ product-টা "Out of stock" হয়ে যাওয়া মানে দোকানে
    জিনিস থাকা অবস্থায় বিক্রি বন্ধ। তাই শূন্য যোগফল মানে "variant-রা
    কিছু বলছে না" — তখন product-এর নিজের হিসাবই চলে।
  */
  const fromVariants = (p.variantStock ?? []).reduce((n, q) => n + q, 0);
  if (fromVariants > 0) return { state: 'IN_STOCK' };

  /*  DEC-PRD-032 — a variant whose count lives in Inventory (itemId set) is
      not hand-counted here. If at least one such variant exists while the
      hand-counted ones read zero, the product stays buyable — the same
      reasoning that keeps TRACKED products outside this gate.  */
  if (p.hasTrackedVariant) return { state: 'IN_STOCK' };

  if (!counted || p.stockQty > 0) return { state: 'IN_STOCK' };

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

