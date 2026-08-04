import { EmployeeDetailView } from "../../_components/EmployeeViews";

/* ⚠️ /employees/[id] is dynamic — `new`, `attendance` and `payroll` are static
   folders and therefore reserved names; Next resolves them first. */
export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmployeeDetailView id={id} />;
}
