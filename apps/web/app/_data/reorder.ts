import { fetchProductDetail } from "./productApi";
import type { Order } from "./order";
import type { NewCartItem } from "../_store/useCartStore";

/*
  Reorder — an old order's snapshot → cart items.

  The snapshot keeps LABELS (not ids), so each line's product is read from the
  shop and the size / bundle / colour are matched by name. A product the shop
  no longer publishes is skipped; add-ons are skipped too (the snapshot has
  their names but not their keys, and a wrong key would put a wrong price in
  the cart — the customer can add them again).

  ⚠️ Until 6 Sep 2026 this looked the products up in the hand-written mock
  catalogue, so Reorder silently did nothing for every real product.
*/
export async function buildReorderItems(order: Order): Promise<NewCartItem[]> {
  const details = await Promise.all(order.lines.map((l) => fetchProductDetail(l.slug)));
  const items: NewCartItem[] = [];

  order.lines.forEach((line, i) => {
    const detail = details[i];
    if (!detail) return; // no longer sold — skipped

    const size = detail.sizes.find((s) => s.label === line.sizeLabel) ?? detail.sizes[0];

    /*  DEC-PRD-013 — every bundle item bought before comes back, found by
        name. One the owner has since removed is not found and is left out —
        the price moves, but nothing that does not exist sits in the cart.  */
    const bundleIds = line.bundleLabels
      .map((label) => detail.bundles.find((b) => b.label === label)?.id)
      .filter((id): id is string => id !== undefined);

    /*  DEC-PRD-012 — the colour bought before, by name (the order stores the
        name as a snapshot). Removed since → undefined → the product's own price.  */
    const variant = (detail.variants ?? []).find((v) => v.label === line.variantLabel);

    items.push({
      slug: line.slug,
      variantId: variant?.id,
      sizeId: size?.id ?? "std",
      bundleIds,
      addonKeys: [],
      persoText: line.persoText,
      qty: line.qty,
    });
  });

  return items;
}
