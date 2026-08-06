import type { Metadata } from "next";
import PayView from "../../_components/Checkout/PayView";

/*
  `/pay/{orderNo}` — WhatsApp-এর "পেমেন্ট হয়নি" বার্তার বোতামটা এখানে নামে।
  DEC-WA-002, DEC-WA-003।

  ⚠️ `noindex` — এটা একজন গ্রাহকের একটা order-এর জন্য, Google-এর জন্য নয়।
  খুঁজে পাওয়ার মতো পাতা নয়, পাঠানো লিংকে পৌঁছানোর মতো পাতা।
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
