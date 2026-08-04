import type { Metadata } from "next";
import Link from "next/link";

import ProductsView from "../_components/Products/ProductsView";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /products — shop-all listing (server shell, ভেতরে ProductsView client)。
  Collection/journal page-এর মতোই: tinted bg, breadcrumb, GBE locked
  (Reviews → Visit Store → Footer)। BestSellers/Delivery "View all" এখন live।
*/

export const metadata: Metadata = {
  title: "Shop All Flowers & Gifts | Radian Dhaka",
  description:
    "Browse the full Radian range — flowers, cakes, gift boxes, chocolates and more, hand-arranged with express, same-day and midnight delivery in Dhaka.",
};

export default function ProductsPage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 flex-wrap py-4 text-[13.5px] text-body-soft"
        >
          <Link href="/" className="hover:text-orchid">
            Home
          </Link>
          <span className="text-lavender-deep">›</span>
          <span className="text-purple font-semibold">Shop all</span>
        </nav>
      </div>

      <div className="max-w-[1200px] mx-auto pt-2 pb-16">
        <ProductsView />
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
