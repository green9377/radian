import { redirect } from "next/navigation";

/*  /products/health — the Health board is gone (owner, 11 Sep 2026). What it
    checked, the publish gate now refuses at the moment it matters instead of
    listing afterwards. The route stays so an old bookmark still works.  */
export default function ProductsHealthPage() {
  redirect("/products/list");
}
