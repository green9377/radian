import type { Metadata } from "next";
import RestoreCartView from "../../_components/Cart/RestoreCartView";

/*
  `/cart/{leadId}` — abandoned বার্তার "Return to cart" বোতামটা এখানে নামে।
  DEC-WA-004।

  ⚠️ `noindex` — একজন গ্রাহকের একটা অসমাপ্ত checkout, Google-এর জন্য নয়।
*/

export const metadata: Metadata = {
  title: "Your saved basket — Radian",
  robots: { index: false, follow: false },
};

export default async function RestoreCartPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  return <RestoreCartView leadId={decodeURIComponent(leadId)} />;
}
