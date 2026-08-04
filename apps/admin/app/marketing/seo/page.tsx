import { Suspense } from "react";
import { SeoView } from "../../_components/SeoView";

/* /marketing/seo — being found IS marketing (owner, 28 Jul 2026), so it sits
   with the campaigns and the offers rather than off in Settings.

   Suspense because SeoView reads ?tab= so the sidebar can link straight to a
   tab; Next requires a boundary around useSearchParams. */
export default function SeoPage() {
  return (
    <Suspense fallback={null}>
      <SeoView />
    </Suspense>
  );
}
