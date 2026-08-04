import { redirect } from "next/navigation";

/* SEO moved to Marketing (owner, 28 Jul 2026) — being found is marketing, not
   a system setting. Old links keep working. */
export default function SeoMoved() {
  redirect("/marketing/seo");
}
