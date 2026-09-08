import type { Metadata } from "next";

import AccountGuard from "../_components/Account/AccountGuard";
import AccountShell from "../_components/Account/AccountShell";
import DashboardView from "../_components/Account/DashboardView";

/*
  /account — the customer dashboard (logged-in only, AccountGuard).
  A quiet page (owner, 8 Sep 2026): no reviews, no store block, no footer.

  SWAP HERE — once the Auth module is locked, the guard becomes a
  server-side session.
*/

export const metadata: Metadata = {
  title: "My Account | Radian",
  robots: { index: false },
};

export default function AccountPage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 pb-16">
        <AccountGuard>
          <AccountShell>
            <DashboardView />
          </AccountShell>
        </AccountGuard>
      </div>

    </main>
  );
}
