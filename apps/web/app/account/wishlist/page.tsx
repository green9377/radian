import type { Metadata } from "next";

import AccountGuard from "../../_components/Account/AccountGuard";
import AccountShell from "../../_components/Account/AccountShell";
import WishlistPanel from "../../_components/Account/WishlistPanel";

/*
  /account/wishlist — the Wishlist tab: saved items plus the customer's own
  folders. The standalone /wishlist (WishlistView) stays separate.
  A quiet page (owner, 8 Sep 2026): no reviews, no store block, no footer.
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

    </main>
  );
}
