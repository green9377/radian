import type { Metadata } from "next";

import AccountGuard from "../../_components/Account/AccountGuard";
import AccountShell from "../../_components/Account/AccountShell";
import OrdersView from "../../_components/Account/OrdersView";
import Reviews from "../../_components/GBE/Reviews";
import VisitStore from "../../_components/GBE/VisitStore";

/*
  /account/orders — order history (logged-in only)।
  GBE locked order: Reviews → VisitStore → Footer (Footer layout-এ)।
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

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
