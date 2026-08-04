import { CampaignsOverview } from "../../_components/MarketingHub";

/* /marketing/campaigns — the Campaigns sub-module's own front page.
   ⚠️ `list` and `sources` are static folders here, so they are reserved names:
   no campaign id may ever be called "list" or "sources". */
export default function CampaignsOverviewPage() {
  return <CampaignsOverview />;
}
