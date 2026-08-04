import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import {
  COLLECTION_SLUGS,
  getCollection,
} from "../../_data/collections";
import CollectionView from "../../_components/Collection/CollectionView";
import { getCollectionDetail } from "../../_data/shop";
import Reviews from "../../_components/GBE/Reviews";
import VisitStore from "../../_components/GBE/VisitStore";

/*
  একটাই route — সব collection এখান দিয়ে যায়:
    /collections/under-1000
    /collections/1000-2000  … ইত্যাদি

  নতুন budget tier যোগ করতে শুধু app/_data/collections.ts-এ একটা config।
  এই file-এ হাত পড়বে না।

  Footer layout.tsx-এ আছে — এখানে আবার বসানো হয়নি।
  GBE order (locked): Reviews → Visit Store → Footer
*/

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return COLLECTION_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const config = getCollection(slug);
  if (config) {
    return { title: config.seo.title, description: config.seo.description };
  }
  const live = await getCollectionDetail(slug);
  if (!live) return {};
  return {
    title: `${live.name} | Radian`,
    description: live.subtitle ?? `Hand-picked gifts in the ${live.name} collection, delivered across Dhaka and Bangladesh.`,
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;

  /*  DB-তে collection থাকলে CollectionView নিজেই সেটা টানে (client-side,
      zone-সহ)। এখানে শুধু "দুই জায়গার কোথাও নেই" হলে ৪০৪ — নইলে অজানা
      DB-slug-ও পাতা পেত না।  */
  const config = getCollection(slug);
  const live = config ? null : await getCollectionDetail(slug);
  if (!config && !live) return notFound();

  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 flex-wrap py-4 text-[13.5px] text-body-soft"
        >
          <Link href="/" className="hover:text-orchid">
            Home
          </Link>
          <span className="text-lavender-deep">›</span>
          <span className="text-purple font-semibold">{config?.chip ?? live?.name ?? slug}</span>
        </nav>
      </div>

      <div className="max-w-[1200px] mx-auto pt-2 pb-16">
        <CollectionView slug={slug} />
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
