import { AffiliateDetail } from "../../../_components/MarketingViews";

/* /marketing/affiliates/[id] — their link, their ledger, and the payout. */
export default async function AffiliateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AffiliateDetail id={id} />;
}
