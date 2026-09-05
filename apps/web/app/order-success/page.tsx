import type { Metadata } from "next";

import OrderSuccessView from "../_components/Checkout/OrderSuccessView";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /order-success — checkout শেষ হলে এখানে redirect।

  আলাদা route কেন (inline success নয়): refresh দিলে খালি checkout ফিরে
  আসত, আর order-এর নিজের URL থাকত না। Track Order page এলে এখান থেকেই
  link যাবে।
*/

export const metadata: Metadata = {
  title: "Order Confirmed | Radian",
  robots: { index: false },
};

export default function OrderSuccessPage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 pb-16">
        <OrderSuccessView />
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
