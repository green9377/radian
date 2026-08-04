import ItemEditor from "../../_components/ItemEditor";

/*
  ⚠️ `/items/[id]` is dynamic, so the static sub-pages (list · new · groups) can never
  be used as an id — same trap as `/products/[slug]` (§১০.১).
*/
export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItemEditor itemId={id} />;
}
