import type { Metadata } from "next";
import { Suspense } from "react";

import LoginView from "../../_components/Account/LoginView";
import Reviews from "../../_components/GBE/Reviews";
import VisitStore from "../../_components/GBE/VisitStore";

/*
  /account/login — WhatsApp login (mock)।

  useSearchParams client-এ (?redirect=…) — Next 16-এ Suspense লাগে।
  GBE locked order: Reviews → VisitStore → Footer (Footer layout-এ)।
*/

export const metadata: Metadata = {
  title: "Log In | Radian",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-16">
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

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
