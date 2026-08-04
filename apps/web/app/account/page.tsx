import type { Metadata } from "next";

import AccountGuard from "../_components/Account/AccountGuard";
import AccountShell from "../_components/Account/AccountShell";
import DashboardView from "../_components/Account/DashboardView";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /account — customer dashboard (logged-in only, AccountGuard)।
  GBE locked order: Reviews → VisitStore → Footer (Footer layout-এ)।

  ⇄ SWAP HERE — Auth module lock হলে guard server-side session হবে।
*/

export const metadata: Metadata = {
  title: "My Account | Radian",
  robots: { index: false },
};

export default function AccountPage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-16">
        <AccountGuard>
          <AccountShell>
            <DashboardView />
          </AccountShell>
        </AccountGuard>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
