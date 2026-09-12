import { redirect } from "next/navigation";

/*  /products/stock — the Stock board is gone (owner, 11 Sep 2026: "stock
    margin health agula lagbe na"). Stock is the Inventory module's to own, and
    this board also wrote a DERIVED count back into a column nothing reads.
    The route stays so an old bookmark lands where stock actually lives.  */
export default function ProductsStockPage() {
  redirect("/inventory/stock");
}
