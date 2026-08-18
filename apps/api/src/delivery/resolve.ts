/* ═══════════════════════════════════════════════════════════════════════════
   WHICH PRICE APPLIES — DEC-DLV-009

   Owner, 1 Aug 2026 (translated): *"here the more specific one wins."*

   The price for a delivery of the same name can be set in two places:

       Same day · all of Dhaka   · ৳100      ← the general rule
       Same day · Dhanmondi      · ৳80       ← that area's own rule

   A customer in Dhanmondi gets ৳80. With no area row, the zone row applies.

   ⚠️ Why this is one function, and why it does not live inside any screen.
   This answer is needed in at least four places — checkout's list, an order's
   total, the admin's new-order form, and POS. Written four times in four
   places, one of them will one day forget that areas exist, and a customer
   will be shown ৳100 and charged ৳80 — or the reverse. The price is worked out
   once.

   ⚠️ This decides "which one do we show", not "what do we charge". When an
   order is created the price and name are **snapshotted** onto it
   (DEC-DLV-002). So the owner changing a price tomorrow does not change
   yesterday's receipt.
   ═══════════════════════════════════════════════════════════════════════════ */

/** just enough to choose a price — the whole Prisma row is not needed */
export interface RateRow {
  id: string;
  typeId: string | null;
  areaId: string | null;
  feePaisa: number;
}

/**
 * Of the rows that exist for one name, which one applies.
 *
 * @param rows   every row for the same `typeId` (area rows + zone rows)
 * @param areaId the area the customer is in. `null` = the area is not known.
 */
export function pickRate<T extends RateRow>(rows: T[], areaId: string | null): T | null {
  if (rows.length === 0) return null;

  /*  1. A row for exactly this area — the most specific, so it comes first.  */
  if (areaId) {
    const exact = rows.find((r) => r.areaId === areaId);
    if (exact) return exact;
  }

  /*  2. A row with no area — the general rule for the whole zone.  */
  const zoneWide = rows.find((r) => r.areaId === null);
  if (zoneWide) return zoneWide;

  /*  3. Rows exist for other areas, but not for this one, and there is no
      general rule either. That means the shop has said this delivery runs only
      in those particular areas.

      ⚠️ **null** here, not the cheapest one. Borrowing another area's price to
      display would promise delivery to a place the shop does not go — and the
      customer would find out after ordering, by phone.  */
  return null;
}

/**
 * The whole list — the deliveries that genuinely run in the customer's area,
 * each with its correct price.
 *
 * ⚠️ A name with no applicable row **drops out** of the list; it does not sit
 * there greyed out. People press greyed-out things; and for a delivery that
 * does not go to that address there is no "why not" to explain — it simply is
 * not there.
 */
export function ratesForArea<T extends RateRow>(
  all: T[],
  areaId: string | null,
): Map<string, T> {
  const byType = new Map<string, T[]>();
  for (const r of all) {
    if (!r.typeId) continue; // an old row, not linked to a name
    const list = byType.get(r.typeId);
    if (list) list.push(r);
    else byType.set(r.typeId, [r]);
  }

  const out = new Map<string, T>();
  for (const [typeId, rows] of byType) {
    const hit = pickRate(rows, areaId);
    if (hit) out.set(typeId, hit);
  }
  return out;
}
