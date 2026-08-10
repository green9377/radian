/**
 * DEC-INV-018 — which store each piece of a sale comes out of.
 *
 * Pulled out of InventoryService on purpose: this is the part with the arithmetic
 * and the edge cases, and a function that needs a database to run is a function
 * nobody tests. Everything here is pure, so `split-stores.selftest.mjs` can prove
 * it in a second without Postgres.
 *
 * The rule (owner, 10 Aug 2026): take from the default store first, then from
 * whichever store has the most. Never refuse — if the stores together cannot
 * cover it, the shortfall is booked on the default store and goes negative,
 * which is an honest shortage rather than a bookkeeping artefact.
 */

export interface StoreHolding {
  warehouseId: string;
  name: string;
  /** what is left in this store AFTER earlier lines of the same order took theirs */
  freeMilli: number;
}

export interface StoreTake {
  warehouseId: string;
  takeMilli: number;
  /** set only when it is NOT the default store — drives the "· from X" note */
  name: string | null;
}

export function splitAcrossStores(
  needMilli: number,
  holdings: StoreHolding[],
  defaultWarehouseId: string,
): StoreTake[] {
  if (needMilli <= 0) return [];

  const usable = [...holdings].filter((h) => h.freeMilli > 0);
  // default first, then the fullest — fewest splits, least surprise on the ledger
  usable.sort((a, b) =>
    a.warehouseId === defaultWarehouseId ? -1
      : b.warehouseId === defaultWarehouseId ? 1
        : b.freeMilli - a.freeMilli);

  const takes: StoreTake[] = [];
  let left = needMilli;
  for (const h of usable) {
    if (left <= 0) break;
    const take = Math.min(h.freeMilli, left);
    left -= take;
    takes.push({
      warehouseId: h.warehouseId,
      takeMilli: take,
      name: h.warehouseId === defaultWarehouseId ? null : h.name,
    });
  }

  if (left > 0) {
    /*  কোথাও নেই (বা কম পড়ল) — ঘাটতিটা default-এ বসবে。 আগেই যদি default থেকে
        কিছু নেওয়া হয়ে থাকে, দুটো সারি না বানিয়ে সেটার সাথেই যোগ করি。       */
    const onDefault = takes.find((t) => t.warehouseId === defaultWarehouseId);
    if (onDefault) onDefault.takeMilli += left;
    else takes.push({ warehouseId: defaultWarehouseId, takeMilli: left, name: null });
  }
  return takes;
}
