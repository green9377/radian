import PurchaseDetailView from "../../_components/PurchaseDetailView";

/* ⚠️ /purchases/[id] is dynamic — the static sub-routes (list/new/returns) are
   declared as their own folders, so they win over this matcher. Same pattern as
   /products/[slug] (§১০.১). */
export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseDetailView id={id} />;
}
