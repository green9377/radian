import { redirect } from "next/navigation";

/* /orders/online-payments folded into Payments -> Gateway attempts (owner, 9 Sep 2026). Old bookmarks land on the new page. */
export default function Page() {
  redirect("/orders/payments");
}
