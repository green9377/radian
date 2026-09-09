import { redirect } from "next/navigation";

/* /orders/action left the menu 9 Sep 2026 — All orders carries Confirm on every row. */
export default function Page() {
  redirect("/orders/list");
}
