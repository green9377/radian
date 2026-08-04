import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OCCASION_PARAMS, getOccasionConfig } from "../../_data/categories";
import { getShopTagGroups } from "../../_data/shop";
import OccasionLive from "../../_components/Occasions/OccasionLive";
import CategorySections from "../../_components/Category/CategorySections";
import Reviews from "../../_components/GBE/Reviews";
import VisitStore from "../../_components/GBE/VisitStore";

/*
  Occasion route — category template-এর ওপরই দাঁড়ানো, cross-category।
    /occasions/birthday · /occasions/anniversary · /occasions/love … ইত্যাদি

  Primary filter = occ tag (cat নয়) — categoryProducts() config.occ দেখে।
  getOccasionConfig() alias resolve করে (love-romance→love, get-well-soon→get-well),
  তাই homepage/category-র পুরনো link কখনো 404 হয় না।

  Footer layout.tsx-এ আছে। GBE order (locked): Reviews → Visit Store → Footer।
*/

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return OCCASION_PARAMS;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  /*  live tag → নিজের নাম দিয়ে title; নইলে পুরনো config-এর SEO।  */
  const groups = await getShopTagGroups();
  const tag = (groups ?? []).flatMap((g) => g.tags).find((t) => t.slug === slug);
  if (tag) {
    return {
      title: `${tag.name} Gifts & Flowers | Radian`,
      description:
        tag.summary ??
        `Hand-arranged flowers, cakes and gifts for ${tag.name.toLowerCase()} — delivered across Dhaka and Bangladesh.`,
    };
  }
  const config = getOccasionConfig(slug);
  if (!config) return {};

  return {
    title: config.seo.title,
    description: config.seo.description,
  };
}

export default async function OccasionPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;

  /*
    ═══ DB প্রথম — ৪ আগস্ট ২০২৬ (মালিকের নিয়ম: কিছুই static নয়) ═══

    Admin → Occasions & Tags-এ এই slug-এর tag থাকলে পাতাটা তার: নাম,
    এক-লাইন, আর `?occasion=` দিয়ে মেলা আসল পণ্য (OccasionLive)। মালিক নতুন
    occasion বানালে সেই মুহূর্তে /occasions/<slug> জন্মে যায় — এই ফাইলে হাত
    না দিয়েই। পুরনো hard-coded config শুধু তখন, যখন tag-টা DB-তে নেই।
  */
  const groups = await getShopTagGroups();
  const liveTag = (groups ?? [])
    .flatMap((g) => g.tags)
    .find((t) => t.slug === slug);

  if (liveTag) {
    return (
      <main className="bg-[#F6F4FA]">
        <OccasionLive slug={liveTag.slug} name={liveTag.name} summary={liveTag.summary} />
        <Reviews />
        <VisitStore />
      </main>
    );
  }

  const config = getOccasionConfig(slug);
  if (!config) return notFound();

  return (
    <main>
      <CategorySections config={config} />
      <Reviews />
      <VisitStore />
    </main>
  );
}
