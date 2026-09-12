import { Suspense } from "react";
import { ReturnsOverview } from "../../_components/ReturnViews";

/* /returns/list — the whole book, searchable, with the two channel doors
   (DEC-RTN-016). It moved off /returns on 12 Sep 2026 when the module root
   became the overview; Suspense because it reads ?channel= . */
export default function ReturnsListPage() {
  return (
    <Suspense fallback={null}>
      <ReturnsOverview />
    </Suspense>
  );
}
