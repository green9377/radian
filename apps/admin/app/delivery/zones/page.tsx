import { redirect } from "next/navigation";

/* Methods & slots became tab 1 of Delivery setup (owner, 10 Sep 2026). */
export default function Page() {
  redirect("/delivery/setup?tab=methods");
}
