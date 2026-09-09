import type { Metadata } from "next";
import PayView from "../../_components/Checkout/PayView";

/*
  Where an unpaid order is finished.

  Two ways in — the gateway's own cancel/fail redirect, and the recovery
  message's button, later — and the page says the same thing to both, because
  the customer needs the same thing either way (owner, 9 Sep 2026). Not for
  search engines.
*/

export const metadata: Metadata = {
  title: "Complete your payment — Radian",
  robots: { index: false, follow: false },
};

export default async function PayPage({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const { orderNo } = await params;
  return <PayView orderNo={decodeURIComponent(orderNo)} />;
}
