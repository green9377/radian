import type { Metadata } from "next";
import { Suspense } from "react";

import LoginView from "../../_components/Account/LoginView";

/*
  /account/login — WhatsApp login.
  useSearchParams runs on the client (?redirect=...), which needs Suspense.
  A quiet page (owner, 8 Sep 2026): no reviews, no store block, no footer.
*/

export const metadata: Metadata = {
  title: "Log In | Radian",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 pb-16">
        <Suspense
          fallback={
            <div className="min-h-[40vh] grid place-items-center">
              <span className="text-[13.5px] text-body-soft">Loading…</span>
            </div>
          }
        >
          <LoginView />
        </Suspense>
      </div>

    </main>
  );
}
