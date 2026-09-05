import type { Metadata } from "next";

import AccountGuard from "../../_components/Account/AccountGuard";
import AccountShell from "../../_components/Account/AccountShell";
import WishlistPanel from "../../_components/Account/WishlistPanel";
import Reviews from "../../_components/GBE/Reviews";
import VisitStore from "../../_components/GBE/VisitStore";

/*
  /account/wishlist — Wishlist tab: saved item + user folder (grouping)।
  standalone /wishlist আলাদা (WishlistView) থাকে।
  GBE locked order: Reviews → VisitStore → Footer (layout-এ)।
*/

export const metadata: Metadata = {
  title: "My Wishlist | Radian",
  robots: { index: false },
};

export default function AccountWishlistPage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 pb-16">
        <AccountGuard>
          <AccountShell>
            <WishlistPanel />
          </AccountShell>
        </AccountGuard>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
