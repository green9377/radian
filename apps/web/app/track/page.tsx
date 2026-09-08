import type { Metadata } from "next";
import { Suspense } from "react";

import TrackOrderView from "../_components/Checkout/TrackOrderView";

/*
  /track — order tracking. "Track this order" on order-success lands here
  (/track?id=RAD-XXXXX). Only the delivery timeline — no receipt, no prices
  (the reasoning is in the track view). useSearchParams runs on the client,
  which needs a Suspense boundary. A quiet page (owner, 8 Sep 2026): no
  reviews, no store block, no footer.

  SWAP HERE — once Ecommerce is locked, /track/[id] becomes a server
  component that fetches the order.
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

    </main>
  );
}
