import { PayrollDetailView } from "../../../_components/PayrollViews";

export default async function PayrollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayrollDetailView id={id} />;
}
