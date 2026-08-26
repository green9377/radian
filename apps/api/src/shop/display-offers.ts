import type { PrismaService } from '../prisma/prisma.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  DEC-PRD-059 — AN AUTOMATIC OFFER SHOWS UP IN THE PRICE (owner, 26 Aug 2026:
  the FlowerAura pattern — struck price + % OFF on the card and the page,
  not a discount that first appears at checkout).

  ── The one rule that keeps this honest ────────────────────────────────────
  A price printed on a card is a PROMISE for buying that one thing. So only
  offers that would certainly apply to a solo purchase may move the shown
  price:

     · AUTOMATIC (nothing to type)
     · PERCENT or FLAT (free delivery is not a product price)
     · SITEWIDE, or CATEGORY / PRODUCT covering this product
     · NO minSpend, NO per-customer limit, NO total cap — a condition that
       might not hold at checkout must never be baked into a printed price.

  Conditional offers keep living in the "Offers for you" strip, where they
  can say their condition out loud.

  ── Why checkout cannot double-apply ───────────────────────────────────────
  Nothing here is stored and nothing here feeds the money path. Checkout
  still prices from the product's own fields and runs the offers engine
  (OFR-R10) on that base — the engine picks its single best automatic
  exactly as before, which for a solo purchase is the same cut computed
  here (same base, same formula, same priority tie-break). The customer can
  only ever pay LESS than the card said (if a bigger conditional offer
  fires), never more.

  ── Where it is applied ────────────────────────────────────────────────────
  catalog.toCard() (every grid card) and product-detail (headline, variant
  prices). Both call `loadDisplayOffers` ONCE per request and then the pure
  `displayCut` per price.
  ═══════════════════════════════════════════════════════════════════════════
*/

export type DisplayOffer = {
  shape: string;
  categoryId: string | null;
  productIds: Set<string>;
  discountType: string;
  discountValue: number;
  maxDiscountPaisa: number | null;
  priority: number;
};

export async function loadDisplayOffers(prisma: PrismaService): Promise<DisplayOffer[]> {
  const now = new Date();
  const rows = await prisma.db.offer.findMany({
    where: {
      deletedAt: null,
      status: 'approved',
      mechanism: 'AUTOMATIC',
      shape: { in: ['SITEWIDE', 'CATEGORY', 'PRODUCT'] },
      discountType: { in: ['PERCENT', 'FLAT'] },
      // unconditional only — see the header
      minSpendPaisa: null,
      perCustomerLimit: null,
      totalLimit: null,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    select: {
      shape: true,
      categoryId: true,
      discountType: true,
      discountValue: true,
      maxDiscountPaisa: true,
      priority: true,
      products: { select: { id: true } },
    },
  });
  return rows.map((o) => ({
    shape: o.shape,
    categoryId: o.categoryId,
    productIds: new Set(o.products.map((p) => p.id)),
    discountType: o.discountType,
    discountValue: o.discountValue,
    maxDiscountPaisa: o.maxDiscountPaisa,
    priority: o.priority,
  }));
}

/**
 * The best cut these offers give ONE unit of this product at `unitPaisa` —
 * the same arithmetic the engine's OFR-R05 runs on a solo line, same
 * priority tie-break as its best-automatic pick. 0 = no offer touches it.
 */
export function displayCut(
  offers: DisplayOffer[],
  p: { id: string; categoryId: string; parentCategoryId: string | null },
  unitPaisa: number,
): number {
  let best = 0;
  let bestPriority = -Infinity;
  for (const o of offers) {
    const covers =
      o.shape === 'SITEWIDE' ||
      (o.shape === 'CATEGORY' &&
        (o.categoryId === p.categoryId || o.categoryId === p.parentCategoryId)) ||
      (o.shape === 'PRODUCT' && o.productIds.has(p.id));
    if (!covers) continue;
    let cut =
      o.discountType === 'PERCENT'
        ? Math.round((unitPaisa * o.discountValue) / 10000)
        : Math.min(o.discountValue, unitPaisa);
    if (o.maxDiscountPaisa) cut = Math.min(cut, o.maxDiscountPaisa);
    if (cut <= 0) continue;
    if (cut > best || (cut === best && o.priority > bestPriority)) {
      best = cut;
      bestPriority = o.priority;
    }
  }
  return best;
}
