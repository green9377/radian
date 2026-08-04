import { redirect } from "next/navigation";

/* moved under Marketing — see /marketing/offers/perf/[id]. */
export default async function OfferPerfMoved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/marketing/offers/perf/${id}`);
}
