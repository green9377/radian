import type { Metadata } from "next";
import PayView from "../../_components/Checkout/PayView";

/*
  Where an unpaid order is finished.

  Two ways in: the gateway's own cancel/fail redirect (`?from=cancel|fail`,
  owner's ruling 9 Sep 2026 — the customer must be TOLD the order is not
  confirmed, not dropped on an empty checkout), and the recovery message's
  button, later. Not for search engines either way.
*/

export const metadata: Metadata = {
  title: "Complete your payment — Radian",
  robots: { index: false, follow: false },
};

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orderNo } = await params;
  const q = await searchParams;
  const raw = Array.isArray(q.from) ? q.from[0] : q.from;
  /*  Read on the server so the warning is in the first paint. A customer
      bounced out of a payment must not watch a calm page turn alarming.  */
  const from = raw === "cancel" || raw === "fail" ? raw : undefined;

  return <PayView orderNo={decodeURIComponent(orderNo)} from={from} />;
}
