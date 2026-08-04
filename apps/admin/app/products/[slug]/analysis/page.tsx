import { ProductAnalysis } from "../../../_components/ProductFunnelViews";

export default async function ProductAnalysisPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProductAnalysis slug={slug} />;
}
