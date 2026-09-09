import { redirect } from "next/navigation";

/* /orders/scheduled left the menu 9 Sep 2026 — All orders, Preparing / out. */
export default function Page() {
  redirect("/orders/list");
}
