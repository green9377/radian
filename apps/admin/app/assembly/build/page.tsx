import { redirect } from "next/navigation";

/** Assembly v1 route — superseded by the pipeline (DEC-ASM-011…016). */
export default function LegacyBuildPage() {
  redirect("/assembly/pipeline");
}
