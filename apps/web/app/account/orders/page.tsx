import type { Metadata } from "next";

import AccountGuard from "../../_components/Account/AccountGuard";
import AccountShell from "../../_components/Account/AccountShell";
import OrdersView from "../../_components/Account/OrdersView";

/*
  /account/orders — order history (logged-in only).
  A quiet page (owner, 8 Sep 2026): no reviews, no store block, no footer.
*/

export const metadata: Metadata = {
  title: "My Orders | Radian",
  robots: { index: false },
};

export default function OrdersPage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 pb-16">
        <AccountGuard>
          <AccountShell>
            <OrdersView />
          </AccountShell>
        </AccountGuard>
      </div>

    </main>
  );
}
