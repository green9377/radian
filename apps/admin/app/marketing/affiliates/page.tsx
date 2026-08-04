import { AffiliatesOverview } from "../../_components/MarketingHub";

/* /marketing/affiliates — the Affiliates sub-module's own front page.
   ⚠️ `list`, `commissions` and `payouts` are static folders here and therefore
   reserved names; Next resolves them before [id]. */
export default function AffiliatesOverviewPage() {
  return <AffiliatesOverview />;
}
