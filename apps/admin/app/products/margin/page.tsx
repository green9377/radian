import { redirect } from "next/navigation";

/*  /products/margin — the Margin board is gone (owner, 11 Sep 2026). Price and
    cost are edited on the product itself, and the money view belongs to
    Finance. The route stays so an old bookmark still lands somewhere useful.  */
export default function ProductsMarginPage() {
  redirect("/products/list");
}
