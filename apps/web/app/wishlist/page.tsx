import type { Metadata } from "next";
import Link from "next/link";

import WishlistView from "../_components/Wishlist/WishlistView";

/*
  /wishlist — the server shell; everything inside is WishlistView (client,
  it needs localStorage). The cart page's exact structure: tinted bg,
  breadcrumb. A quiet page (owner, 8 Sep 2026): no reviews, no store block,
  no footer. noindex — a personal list, nothing to index.
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

    </main>
  );
}
