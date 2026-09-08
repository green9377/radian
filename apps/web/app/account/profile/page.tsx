import type { Metadata } from "next";

import AccountGuard from "../../_components/Account/AccountGuard";
import AccountShell from "../../_components/Account/AccountShell";
import ProfilePanel from "../../_components/Account/ProfilePanel";

export const metadata: Metadata = {
  title: "Profile | Radian",
  robots: { index: false },
};

export default function AccountProfilePage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 pb-16">
        <AccountGuard>
          <AccountShell>
            <ProfilePanel />
          </AccountShell>
        </AccountGuard>
      </div>

    </main>
  );
}
