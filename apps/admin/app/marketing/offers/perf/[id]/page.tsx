import OfferDetail from "../../../../_components/OfferDetail";

/* /offers/perf/[id] — one offer's performance, live against the API (22 Aug 2026). */
export default async function OfferPerfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OfferDetail id={id} />;
}
