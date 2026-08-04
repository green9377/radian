import SupplierEditor from "../../../_components/SupplierEditor";

export default async function SupplierEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierEditor supplierId={id} />;
}
