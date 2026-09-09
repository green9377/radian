import { redirect } from "next/navigation";

/* /orders/cancelled folded into All orders -> Cancelled segment (owner, 9 Sep 2026). */
export default function Page() {
  redirect("/orders/list");
}
