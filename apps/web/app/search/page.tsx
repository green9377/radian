import type { Metadata } from "next";
import { Suspense } from "react";

import SearchView from "../_components/Search/SearchView";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /search?q= — product search।

  Header box আর নিজের box দুটোই এখানে navigate করে।
  useSearchParams client-এ — Next 16-এ Suspense boundary লাগে (track page-এর মতোই)।
  GBE locked order: Reviews → VisitStore → Footer (Footer layout-এ)।
  noindex — search result page index করার মতো নয়।

  ⇄ SWAP HERE — Ecommerce lock হলে searchProducts() ভেতরে fetch() হবে,
  এই shell বদলাবে না।
*/

export const metadata: Metadata = {
  title: "Search | Radian",
  robots: { index: false },
};

export default function SearchPage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="px-2 sm:px-4 pb-16">
        <Suspense
          fallback={
            <div className="min-h-[40vh] grid place-items-center">
              <span className="text-[13.5px] text-body-soft">Loading…</span>
            </div>
          }
        >
          <SearchView />
        </Suspense>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
