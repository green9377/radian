import type { Metadata } from "next";
import Link from "next/link";

import CheckoutView from "../_components/Checkout/CheckoutView";

/*
  /checkout — the server shell; everything inside is CheckoutView (client:
  the cart and the checkout store both live in localStorage).

  The shell is FlowerAura's shape (owner, 7 Sep 2026): its own slim header
  (Header.tsx swaps it in on this path), no breadcrumb, one way back — to the
  cart. A quiet page (owner, 8 Sep 2026): no reviews, no store block, no footer.

  No "Need Help Choosing" section here — D19: SupportPanel is the one support
  channel. No WhatsApp-order button either.
*/

export const metadata: Metadata = {
  title: "Secure Checkout | Radian",
  description:
    "Choose your delivery slot, add a gift message and pay securely. Fast delivery inside Dhaka, nationwide in 1–3 days.",
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
    ⚠️ THE LAST-RESORT LANDING FROM A FAILED PAYMENT.

    A cancelled or failed payment goes to `/pay/{orderNo}` now, which can say
    what happened and take the money. It only comes HERE when the gateway
    returned no transaction id at all and the order cannot be named.

    Until 9 Sep 2026 every failed payment landed here and this page read the
    parameter nowhere — and the cart had already been emptied when the order
    was written, so the customer stood in front of a blank form with no word
    about their money. Saying something is the least this page owes them.
  */
  const q = await searchParams;
  const raw = Array.isArray(q.payment) ? q.payment[0] : q.payment;
  const failed = raw === "cancel" || raw === "fail";

  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6">
        <Link
          href="/cart"
          className="inline-flex items-center gap-1.5 pt-5 text-[13.5px] font-semibold text-purple hover:text-orchid"
        >
          <span aria-hidden>‹</span> Back to cart
        </Link>

        {failed && (
          <div
            role="alert"
            className="mt-4 rounded-[16px] bg-[#FDECEE] border border-[#F5C2C7] px-4 py-3.5"
          >
            <p className="text-[13.5px] font-bold text-[#8A1220]">
              The payment didn&rsquo;t go through, so your order is not confirmed.
            </p>
            <p className="mt-1 text-[12.5px] leading-snug text-[#8A1220]">
              Nothing has been charged. Your order is saved — we&rsquo;ve sent the
              payment link to your phone, or you can find it under{" "}
              <Link href="/track" className="underline font-bold">
                Track Order
              </Link>
              .
            </p>
          </div>
        )}

        <div className="pb-24 lg:pb-16">
          <CheckoutView />
        </div>
      </div>

    </main>
  );
}
