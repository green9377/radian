import PosSaleView from "../../../_components/PosSaleView";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PosSaleView id={id} />;
}
