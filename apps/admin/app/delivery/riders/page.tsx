import { redirect } from "next/navigation";

/* Riders became tab 3 of Delivery setup (owner, 10 Sep 2026). */
export default function Page() {
  redirect("/delivery/setup?tab=carriers");
}
