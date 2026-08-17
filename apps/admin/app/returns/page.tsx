import { Suspense } from "react";
import { ReturnsOverview } from "../_components/ReturnViews";

/* /returns — Returns & Refunds Overview + list (DEC-RTN).

   Suspense because ReturnsOverview reads ?channel= (DEC-RTN-016): the panel
   offers this same book through a website door and a counter door, and Next
   requires a boundary around useSearchParams. Same shape as /marketing/seo. */
export default function ReturnsPage() {
  return (
    <Suspense fallback={null}>
      <ReturnsOverview />
    </Suspense>
  );
}
