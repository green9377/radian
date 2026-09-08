import type { Metadata } from "next";
import Link from "next/link";

import CartView from "../_components/Cart/CartView";

/*
  /cart — the server shell; everything inside is CartView (client, it needs
  localStorage). Page background tinted, content on a white card — as on
  the PDP. A quiet page (owner, 8 Sep 2026): no reviews, no store block, no
  footer. SupportPanel stays (layout.tsx).

  No "Need Help Choosing" section here — D19: SupportPanel is the one
  support channel.
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

    </main>
  );
}
