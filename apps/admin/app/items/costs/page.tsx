import { redirect } from "next/navigation";

/**
 * The Costs board was removed on 21 Jul — every figure on it already lived on the
 * Overview or All items. A redirect rather than a 404 because bookmarks and old
 * Overview links should keep landing somewhere sensible: the item list, sorted by
 * cost, which is what people came here to see.
 */
export default function ItemCostsRedirect() {
  redirect("/items/list?sort=cost");
}
