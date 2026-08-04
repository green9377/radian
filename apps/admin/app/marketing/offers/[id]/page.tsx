import { OfferEditorLive } from "../../../_components/OffersLive";

/*
  /offers/[id] — LIVE offer editor (Core-6, DEC-OFR-001). id = "new" for create.
  Next 16: params is a Promise, so await.
*/
export default async function OfferEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OfferEditorLive id={id} />;
}
