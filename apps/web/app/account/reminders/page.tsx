import type { Metadata } from "next";

import AccountGuard from "../../_components/Account/AccountGuard";
import AccountShell from "../../_components/Account/AccountShell";
import RemindersPanel from "../../_components/Account/RemindersPanel";

/*  A quiet page (owner, 8 Sep 2026): no reviews rail, no store block, no
    footer. Everything on it comes from `/shop/account/*` — nothing here is
    written in the browser any more.  */

export const metadata: Metadata = {
  title: "Reminders | Radian",
  robots: { index: false },
};

export default function Page() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 pb-16">
        <AccountGuard>
          <AccountShell>
            <RemindersPanel />
          </AccountShell>
        </AccountGuard>
      </div>
    </main>
  );
}
