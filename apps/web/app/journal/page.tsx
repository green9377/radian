import type { Metadata } from "next";
import Link from "next/link";

import LiveJournalIndex from "../_components/Journal/LiveJournalIndex";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /journal — server shell, ভেতরে JournalIndex (server component)。
  About/contact page-এর মতোই: tinted bg, breadcrumb, GBE locked
  (Reviews → Visit Store → Footer)। Footer /journal link এখন live।
*/

export const metadata: Metadata = {
  title: "The Radian Journal | Flower Care & Gifting Guides",
  description:
    "Flower care tips, gifting guides and delivery ideas from Radian — the premium flower and gift studio in Dhaka.",
};

export default function JournalPage() {
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
          <span className="text-purple font-semibold">Journal</span>
        </nav>

        <div className="pt-4 pb-16">
          <LiveJournalIndex />
        </div>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
