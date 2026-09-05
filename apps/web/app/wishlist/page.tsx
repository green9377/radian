import type { Metadata } from "next";
import Link from "next/link";

import WishlistView from "../_components/Wishlist/WishlistView";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /wishlist — server shell, ভেতরের সবটা WishlistView (client, localStorage লাগে)।

  Cart page-এর হুবহু গঠন: tinted bg, breadcrumb, GBE locked
  (Reviews → Visit Store → Footer)। Footer + SupportPanel layout.tsx-এ।
  noindex — ব্যক্তিগত save-list, index করার মতো নয়।
*/

export const metadata: Metadata = {
  title: "Your Wishlist | Radian",
  robots: { index: false },
};

export default function WishlistPage() {
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
          <span className="text-purple font-semibold">Wishlist</span>
        </nav>

        <div className="pb-16">
          <WishlistView />
        </div>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
