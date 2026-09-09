import { redirect } from "next/navigation";

/* /orders/recovery became Lost orders (9 Sep 2026). */
export default function Page() {
  redirect("/orders/lost");
}
