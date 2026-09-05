import type { Metadata } from "next";
import Link from "next/link";

import AboutView from "../_components/About/AboutView";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";
import { getContentPage } from "../_data/content";
import { LivePolicyView } from "../_components/Policy/PolicyView";

/*
  /about — server shell, ভেতরে AboutView (server component)।
  Cart/policy/faq page-এর মতোই: tinted bg, breadcrumb, GBE locked
  (Reviews → Visit Store → Footer)। Footer /about link এখন live।
  Physical store = GBE-র VisitStore, তাই আলাদা করে বসাইনি।
*/

export const metadata: Metadata = {
  title: "About Radian | Flowers & Gifts in Dhaka",
  description:
    "Radian is a premium flower and gift studio in Dhaka — hand-arranged, honestly priced, and delivered while the moment still matters.",
};

/*
  ═══ DB-OVERRIDE — মালিকের নিয়ম, ৪ আগস্ট ২০২৬: "কিছুই static নয়" ═══
  Admin → Storefront → Pages & FAQs-এ এই slug-এর published পাতা থাকলে
  সেটাই দেখায় (LivePolicyView); না থাকলে নিচের designed পাতা। ডিজাইন করা
  সংস্করণটা fallback হিসেবে থাকে — মালিক নিজের লেখায় নিলেই সরে দাঁড়ায়।
*/
export default async function AboutPage() {
  const live = await getContentPage("about");
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

  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 flex-wrap py-4 text-[13.5px] text-body-soft"
        >
          <Link href="/" className="hover:text-orchid">
            Home
          </Link>
          <span className="text-lavender-deep">›</span>
          <span className="text-purple font-semibold">About</span>
        </nav>

        <div className="pt-4 pb-16">
          <AboutView />
        </div>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
