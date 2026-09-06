import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getShopTagGroups } from "../../_data/shop";
import OccasionLive from "../../_components/Occasions/OccasionLive";
import Reviews from "../../_components/GBE/Reviews";
import VisitStore from "../../_components/GBE/VisitStore";

/*
  Occasion route — cross-category: /occasions/birthday, /occasions/anniversary…

  The page is the admin's tag (Occasions & Tags): its name, its one-line
  summary, and the real products carrying it. A slug with no such tag is a
  404 — the hand-written occasion configs that used to stand in are gone
  (owner, 6 Sep 2026: real data or nothing).

  GBE order (locked): Reviews → Visit Store → Footer (Footer in layout.tsx).
*/

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const groups = await getShopTagGroups();
  const tag = (groups ?? []).flatMap((g) => g.tags).find((t) => t.slug === slug);
  if (!tag) return {};
  return {
    title: `${tag.name} Gifts & Flowers | Radian`,
    description:
      tag.summary ??
      `Hand-arranged flowers, cakes and gifts for ${tag.name.toLowerCase()} — delivered across Dhaka and Bangladesh.`,
    alternates: { canonical: `/occasions/${slug}` },
  };
}

export default async function OccasionPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;

  const groups = await getShopTagGroups();
  const liveTag = (groups ?? []).flatMap((g) => g.tags).find((t) => t.slug === slug);
  if (!liveTag) return notFound();

  return (
    <main className="bg-[#F6F4FA]">
      <OccasionLive slug={liveTag.slug} name={liveTag.name} summary={liveTag.summary} />
      <Reviews />
      <VisitStore />
    </main>
  );
}
