import { EmployeeEditor } from "../../../_components/EmployeeViews";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmployeeEditor id={id} />;
}
