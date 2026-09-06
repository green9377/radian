import type { Metadata } from "next";
import { Suspense } from "react";

import OrderSuccessView from "../_components/Checkout/OrderSuccessView";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /order-success — where checkout lands when it is done.

  Its own route (not an inline success state): a refresh used to bring back an
  empty checkout, and the order had no address of its own. Track Order links
  from here.

  `useSearchParams` in the view needs a Suspense boundary of its own — the
  root loading.tsx used to be that boundary for the whole site, and went on
  6 Sep 2026 so that a 404 can be a real 404.
*/

export const metadata: Metadata = {
  title: "Order Confirmed | Radian",
  robots: { index: false },
};

export default function OrderSuccessPage() {
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
          <OrderSuccessView />
        </Suspense>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
