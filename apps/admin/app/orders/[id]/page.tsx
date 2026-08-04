import OrderEditor from "../../_components/OrderEditor";

/*
  /orders/[id] — order detail. Next 16: params is a Promise, so await.
*/
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderEditor id={id} />;
}
