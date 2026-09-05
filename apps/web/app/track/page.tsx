import type { Metadata } from "next";
import { Suspense } from "react";

import TrackOrderView from "../_components/Checkout/TrackOrderView";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /track — Order tracking page।

  order-success থেকে "Track this order" (/track?id=RAD-XXXXX) এখানে আসে।
  শুধু delivery timeline দেখায় — receipt/দাম নয় (§track view-এ কারণ)।

  useSearchParams client-এ — Next 16-এ Suspense boundary লাগে।
  GBE locked order: Reviews → VisitStore → Footer (Footer layout-এ)।

  ⇄ SWAP HERE — Ecommerce lock হলে /track/[id] server component হয়ে
  order fetch করবে।
*/

export const metadata: Metadata = {
  title: "Track Your Order | Radian",
  robots: { index: false },
};

export default function TrackPage() {
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
          <TrackOrderView />
        </Suspense>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
