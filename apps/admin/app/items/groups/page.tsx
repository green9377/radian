import { redirect } from "next/navigation";

/** renamed to Item categories (DEC-ITM-007 rev, 21 Jul) — keep old links working */
export default function ItemGroupsRedirect() {
  redirect("/items/categories");
}
