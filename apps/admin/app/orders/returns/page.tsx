import { redirect } from "next/navigation";

/* /orders/returns folded into Payments -> Returns & refunds (owner, 9 Sep 2026). */
export default function Page() {
  redirect("/orders/payments");
}
