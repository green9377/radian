import type { Metadata } from "next";
import PayView from "../../_components/Checkout/PayView";

/* Where the "payment did not go through" button lands. Not for search engines. */

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
