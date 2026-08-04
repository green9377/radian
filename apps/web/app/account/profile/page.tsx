import type { Metadata } from "next";

import AccountGuard from "../../_components/Account/AccountGuard";
import AccountShell from "../../_components/Account/AccountShell";
import ProfilePanel from "../../_components/Account/ProfilePanel";
import Reviews from "../../_components/GBE/Reviews";
import VisitStore from "../../_components/GBE/VisitStore";

export const metadata: Metadata = {
  title: "Profile | Radian",
  robots: { index: false },
};

export default function AccountProfilePage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-16">
        <AccountGuard>
          <AccountShell>
            <ProfilePanel />
          </AccountShell>
        </AccountGuard>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
