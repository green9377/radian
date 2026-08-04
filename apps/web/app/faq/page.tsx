import type { Metadata } from "next";
import Link from "next/link";

import FaqView from "../_components/Faq/FaqView";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /faq — server shell, ভেতরে FaqView (server, <details> accordion)।
  Cart/policy page-এর মতোই: tinted bg, breadcrumb, GBE locked
  (Reviews → Visit Store → Footer)। Footer /faq link এখন live।
*/

export const metadata: Metadata = {
  title: "FAQ | Radian",
  description:
    "Answers to common questions about ordering, delivery, payment, gifting and returns at Radian Flower & Gift Shop.",
};

export default function FaqPage() {
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
          <span className="text-purple font-semibold">FAQ</span>
        </nav>

        <div className="pb-16">
          <FaqView />
        </div>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
