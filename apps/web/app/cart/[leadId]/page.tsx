import type { Metadata } from "next";
import RestoreCartView from "../../_components/Cart/RestoreCartView";

/* Where the abandoned-cart button lands. Not for search engines. */

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
