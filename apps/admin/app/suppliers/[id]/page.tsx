import SupplierDetailView from "../../_components/SupplierDetailView";

/* ⚠️ /suppliers/[id] is dynamic — the static sub-routes (list/new/settings) are
   their own folders, so they win over this matcher. Same pattern as /purchases/[id]. */
export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierDetailView supplierId={id} />;
}
