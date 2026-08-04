import OrderEditForm from "../../../_components/OrderEditForm";

/*
  /orders/[id]/edit — one page with every edit option for the order.
  Next 16: params is a Promise, so await.
*/
export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderEditForm id={id} />;
}
