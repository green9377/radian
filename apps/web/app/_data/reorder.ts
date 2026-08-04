import { getProductDetail } from "./productDetails";
import type { Order } from "./order";
import type { NewCartItem } from "../_store/useCartStore";

/*
  Reorder — পুরনো order snapshot → cart item।

  ⚠️ snapshot-এ label রাখা হয় (id নয়), তাই getProductDetail() দিয়ে
  size/bundle label → id map করি। না মিললে default (প্রথম size / base
  bundle)। add-on বাদ — snapshot-এ name আছে কিন্তু key নেই, তাই ভুল
  key বসিয়ে দাম গোলমাল করার চেয়ে বাদ দেওয়াই নিরাপদ; customer cart-এ
  আবার যোগ করতে পারবে।

  catalog-এ আর নেই এমন product চুপচাপ বাদ।

  ⇄ SWAP HERE — Ecommerce lock হলে reorder হবে POST /cart/reorder/:orderId,
  server-side variant resolve করবে।
*/
export function buildReorderItems(order: Order): NewCartItem[] {
  const items: NewCartItem[] = [];

  for (const line of order.lines) {
    const detail = getProductDetail(line.slug);
    if (!detail) continue; // আর নেই — বাদ

    const size =
      detail.sizes.find((s) => s.label === line.sizeLabel) ?? detail.sizes[0];

    /*  DEC-PRD-013 — আগের সব bundle ফিরিয়ে আনা হয়, নাম দিয়ে খুঁজে।
        মালিক যেটা তুলে দিয়েছেন সেটা পাওয়া যায় না আর বাদ পড়ে — দাম নড়ে,
        কিন্তু cart-এ অস্তিত্বহীন কিছু বসে না।  */
    const bundleIds = line.bundleLabels
      .map((label) => detail.bundles.find((b) => b.label === label)?.id)
      .filter((id): id is string => id !== undefined);

    /*  DEC-PRD-012 — যে রঙটা আগে কেনা হয়েছিল সেটাই আবার। নাম দিয়ে খোঁজা
        হয়, কারণ order-এ snapshot হিসেবে নামটাই রাখা আছে; মালিক সেই রঙটা
        তুলে দিলে `undefined`, আর তখন product-এর নিজের দামেই যায়।  */
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
  }

  return items;
}

/** কোনো line reorder-যোগ্য (এখনো catalog-এ আছে) কি না */
export function canReorder(order: Order): boolean {
  return order.lines.some((l) => getProductDetail(l.slug) !== null);
}
