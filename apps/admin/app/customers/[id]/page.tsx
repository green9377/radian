import CustomerEditor from "../../_components/CustomerEditor";

/*
  /customers/[id] — edit. Next 16: params is a Promise, so await.
*/
export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerEditor id={id} />;
}
