import { ReturnDetail } from "../../_components/ReturnViews";

/* ⚠️ /returns/[id] is dynamic — new/settings are their own folders and win over
   this matcher. Same pattern as /suppliers/[id]. */
export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReturnDetail id={id} />;
}
