import { redirect } from "next/navigation";

/* Sessions merged into the Activity page (owner, 18 Aug 2026). The address
   survives for bookmarks and old links; the screen lives at /settings/audit. */
export default function Page() {
  redirect("/settings/audit?tab=sessions");
}
