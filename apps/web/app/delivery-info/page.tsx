import type { Metadata } from "next";
import PolicyPageShell from "../_components/Policy/PolicyPageShell";
import { policyMeta } from "../_data/policies";
import { getContentPage } from "../_data/content";
import { LivePolicyView } from "../_components/Policy/PolicyView";
import Link from "next/link";

export const metadata: Metadata = policyMeta("delivery-info");

/*
  ═══ DB-OVERRIDE — মালিকের নিয়ম, ৪ আগস্ট ২০২৬: "কিছুই static নয়" ═══
  Admin → Storefront → Pages & FAQs-এ এই slug-এর published পাতা থাকলে
  সেটাই দেখায় (LivePolicyView); না থাকলে নিচের designed পাতা। ডিজাইন করা
  সংস্করণটা fallback হিসেবে থাকে — মালিক নিজের লেখায় নিলেই সরে দাঁড়ায়।
*/
export default async function DeliveryInfoPage() {
  const live = await getContentPage("delivery-info");
  if (live) {
    return (
      <main className="bg-[#F6F4FA]">
        <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 flex-wrap py-4 text-[13.5px] text-body-soft">
            <Link href="/" className="hover:text-orchid">Home</Link>
            <span className="text-lavender-deep">›</span>
            <span className="text-purple font-semibold">{live.title}</span>
          </nav>
          <div className="pb-16"><LivePolicyView page={live} /></div>
        </div>
      </main>
    );
  }

  return <PolicyPageShell slug="delivery-info" />;
}
