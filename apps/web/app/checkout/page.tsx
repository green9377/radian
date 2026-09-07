import type { Metadata } from "next";
import Link from "next/link";

import CheckoutView from "../_components/Checkout/CheckoutView";
import Reviews from "../_components/GBE/Reviews";
import VisitStore from "../_components/GBE/VisitStore";

/*
  /checkout — the server shell; everything inside is CheckoutView (client:
  the cart and the checkout store both live in localStorage).

  The shell is FlowerAura's shape (owner, 7 Sep 2026): its own slim header
  (Header.tsx swaps it in on this path), no breadcrumb, one way back — to the
  cart. GBE order (locked): Reviews → Visit Store → Footer (layout.tsx).

  No "Need Help Choosing" section here — D19: SupportPanel is the one support
  channel. No WhatsApp-order button either.
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
        <Link
          href="/cart"
          className="inline-flex items-center gap-1.5 pt-5 text-[13.5px] font-semibold text-purple hover:text-orchid"
        >
          <span aria-hidden>‹</span> Back to cart
        </Link>

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
