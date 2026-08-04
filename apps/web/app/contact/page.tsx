import type { Metadata } from "next";
import Link from "next/link";

import ContactView from "../_components/Contact/ContactView";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";
import { getContentPage } from "../_data/content";
import { LivePolicyView } from "../_components/Policy/PolicyView";

/*
  /contact — server shell, ভেতরে ContactView (server component)।
  About/faq page-এর মতোই: tinted bg, breadcrumb, GBE locked
  (Reviews → Visit Store → Footer)। Footer /contact link এখন live।
  D19: form-backend নেই; সরাসরি WhatsApp / Call / Email deep-link।
*/

export const metadata: Metadata = {
  title: "Contact Radian | Flowers & Gifts in Dhaka",
  description:
    "Reach Radian on WhatsApp, phone or email for orders, last-minute gifts, corporate gifting and support — open every day, 9 AM to 10 PM.",
};

/*
  ═══ DB-OVERRIDE — মালিকের নিয়ম, ৪ আগস্ট ২০২৬: "কিছুই static নয়" ═══
  Admin → Storefront → Pages & FAQs-এ এই slug-এর published পাতা থাকলে
  সেটাই দেখায় (LivePolicyView); না থাকলে নিচের designed পাতা। ডিজাইন করা
  সংস্করণটা fallback হিসেবে থাকে — মালিক নিজের লেখায় নিলেই সরে দাঁড়ায়।
*/
export default async function ContactPage() {
  const live = await getContentPage("contact");
  if (live) {
    return (
      <main className="bg-[#F6F4FA]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
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
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 flex-wrap py-4 text-[13.5px] text-body-soft"
        >
          <Link href="/" className="hover:text-orchid">
            Home
          </Link>
          <span className="text-lavender-deep">›</span>
          <span className="text-purple font-semibold">Contact</span>
        </nav>

        <div className="pt-4 pb-16">
          <ContactView />
        </div>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
