import type { Metadata } from "next";

import AccountGuard from "../../_components/Account/AccountGuard";
import AccountShell from "../../_components/Account/AccountShell";
import AddressesPanel from "../../_components/Account/AddressesPanel";
import Reviews from "../../_components/GBE/Reviews";
import VisitStore from "../../_components/GBE/VisitStore";

export const metadata: Metadata = {
  title: "Addresses | Radian",
  robots: { index: false },
};

export default function AccountAddressesPage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 pb-16">
        <AccountGuard>
          <AccountShell>
            <AddressesPanel />
          </AccountShell>
        </AccountGuard>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
