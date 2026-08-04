import type { Metadata } from "next";
import Link from "next/link";

import Reviews from "./_components/GBE/Reviews";
import VisitStore from "./_components/GBE/VisitStore";

/*
  404 — কোনো route না মিললে।
  GBE locked order: Reviews → VisitStore → Footer (layout-এ)।
*/

export const metadata: Metadata = {
  title: "Page Not Found | Radian",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-16">
        <div className="py-16 sm:py-24 grid place-items-center text-center">
          {/* petal motif */}
          <span className="w-16 h-16 rounded-[50%_50%_50%_0] -rotate-45 bg-orchid-soft grid place-items-center">
            <span className="rotate-45 font-display text-[22px] text-orchid font-semibold">
              404
            </span>
          </span>

          <h1 className="font-display text-[30px] sm:text-[38px] text-purple font-semibold mt-6">
            This page has wilted
          </h1>
          <p className="text-[14.5px] text-body mt-3 max-w-[440px]">
            The page you&apos;re looking for isn&apos;t here — it may have moved,
            or the link was mistyped. Let&apos;s get you back to something
            beautiful.
          </p>

          <div className="flex flex-wrap justify-center gap-2.5 mt-7">
            <Link
              href="/"
              className="inline-flex items-center h-[50px] px-6 bg-purple text-white rounded-[16px] font-semibold text-[14.5px] hover:bg-purple-deep transition-colors"
            >
              Back to home
            </Link>
            <Link
              href="/products"
              className="inline-flex items-center h-[50px] px-6 bg-white border-[1.5px] border-lavender-deep text-purple rounded-[16px] font-semibold text-[14.5px] hover:border-orchid-mid transition-colors"
            >
              Shop all gifts
            </Link>
          </div>

          {/* quick links */}
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-8 text-[13px] font-semibold text-body-soft">
            <Link href="/occasions" className="hover:text-orchid transition-colors">
              Occasions
            </Link>
            <Link href="/track" className="hover:text-orchid transition-colors">
              Track an order
            </Link>
            <Link href="/faq" className="hover:text-orchid transition-colors">
              FAQs
            </Link>
            <Link href="/contact" className="hover:text-orchid transition-colors">
              Contact us
            </Link>
          </div>
        </div>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
