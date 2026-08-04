import { CampaignDetail } from "../../../_components/MarketingViews";

/* /marketing/campaigns/[id] — the three-line ROI (MKT-D06).
   ⚠️ dynamic segment: no static campaign route may share this level. */
export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CampaignDetail id={id} />;
}
