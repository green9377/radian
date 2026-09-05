import type { Metadata } from "next";
import Link from "next/link";

import CheckoutView from "../_components/Checkout/CheckoutView";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /checkout — server shell, ভেতরের সবটা CheckoutView (client: cart +
  checkout store, দুটোই localStorage)।

  GBE order (locked): Reviews → Visit Store → Footer (layout.tsx-এ)।

  ⚠️ Board-এর "Need Help Choosing" section এখানে **নেই** — D19:
  SupportPanel-ই একমাত্র support channel। WhatsApp-order button-ও নেই।
*/

export const metadata: Metadata = {
  title: "Secure Checkout | Radian",
  description:
    "Choose your delivery slot, add a gift message and pay securely. Fast delivery inside Dhaka, nationwide in 1–3 days.",
};

export default function CheckoutPage() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 flex-wrap pt-4 text-[13.5px] text-body-soft"
        >
          <Link href="/" className="hover:text-orchid">
            Home
          </Link>
          <span className="text-lavender-deep">›</span>
          <Link href="/cart" className="hover:text-orchid">
            Cart
          </Link>
          <span className="text-lavender-deep">›</span>
          <span className="text-purple font-semibold">Checkout</span>
        </nav>

        <div className="pb-24 lg:pb-16">
          <CheckoutView />
        </div>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
