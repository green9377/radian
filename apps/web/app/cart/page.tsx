import type { Metadata } from "next";
import Link from "next/link";

import CartView from "../_components/Cart/CartView";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /cart — server shell, ভেতরের সবটা CartView (client, localStorage লাগে)।

  Page background tinted, content সাদা card-এ — PDP-র মতোই।
  Footer + SupportPanel layout.tsx-এ। GBE order (locked):
  Reviews → Visit Store → Footer.

  ⚠️ Board-এর "Need Help Choosing" section এখানে নেই — D19: SupportPanel-ই
  একমাত্র support channel।
*/

export const metadata: Metadata = {
  title: "Your Cart | Radian",
  description:
    "Review your flowers and gifts before checkout. Fast delivery inside Dhaka, nationwide in 1–3 days.",
};

export default function CartPage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 flex-wrap py-4 text-[13.5px] text-body-soft"
        >
          <Link href="/" className="hover:text-orchid">
            Home
          </Link>
          <span className="text-lavender-deep">›</span>
          <span className="text-purple font-semibold">Cart</span>
        </nav>

        <div className="pb-16">
          <CartView />
        </div>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
