import OfferDetail from "../../../../_components/OfferDetail";

/* /offers/perf/[id] — per-offer detail / analytics. MOCK (§9). */
export default async function OfferPerfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OfferDetail id={id} />;
}
