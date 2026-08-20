/**
 * DEC-ADM-012 (owner, 20 Aug 2026) — hiding a cost in the browser is not a
 * permission, it is a curtain. Anyone can open the network tab.
 *
 * So when the person asking does not hold "See cost prices", the buying figures
 * leave the response entirely. What remains is the selling side, which is what a
 * cashier needs to do the job.
 *
 * The list is deliberately explicit. A blanket "delete anything with cost in the
 * name" would one day eat a field that matters, quietly, and nobody would notice
 * until a report was wrong.
 */
const COST_FIELDS = [
  'standardCostPaisa',
  'computedCostPaisa',
  'effectiveCostPaisa',
  'costPaisa',
  'unitCostPaisa',
  'valuePaisa', // stock value = qty × cost, so it is a cost figure in disguise
  'floorPricePaisa', // the floor is cost + margin: it gives the cost away
  'minMarginBp',
  'minMarginPaisa',
  'markupBp',
  'markupUsedBp',
  'suggestedSellPricePaisa', // = cost + markup, same problem
] as const;

type Json = unknown;

/** a copy with every cost figure removed, however deep it sits */
export function stripCost<T extends Json>(input: T): T {
  if (Array.isArray(input)) return input.map((v) => stripCost(v)) as unknown as T;
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if ((COST_FIELDS as readonly string[]).includes(k)) continue;
      out[k] = stripCost(v);
    }
    return out as T;
  }
  return input;
}

/** `stripCost` unless the caller may see cost */
export function costFor<T extends Json>(canSeeCost: boolean | undefined, data: T): T {
  return canSeeCost ? data : stripCost(data);
}
