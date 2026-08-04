import { redirect } from "next/navigation";

/** Assembly v1 route — superseded (DEC-ASM-011…016). */
export default function LegacyHistoryPage() {
  redirect("/assembly/pipeline");
}
