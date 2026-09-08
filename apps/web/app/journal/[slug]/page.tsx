import type { Metadata } from "next";
import Link from "next/link";

import LiveArticle from "../../_components/Journal/LiveArticle";
import { getJournalPost } from "../../_data/shop";
import Reviews from "../../_components/GBE/Reviews";
import VisitStore from "../../_components/GBE/VisitStore";

/*
  একটাই route — সব article এখান দিয়ে যায়: /journal/[slug]।
  নতুন লেখা যোগ করতে শুধু app/_data/journal.ts-এ একটা object।
  GBE order (locked): Reviews → Visit Store → Footer।
*/

type Params = { slug: string };

/*  No `generateStaticParams`: the posts live in the admin, and a hand-written
    list of slugs is exactly what used to 404 every real article.  */

/*  The title is the article's, and the article lives in the admin — so the
    page asks for it here rather than reading a hand-written list.  */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getJournalPost(slug);
  if (!post) return { title: "The Radian Journal" };
  return {
    title: `${post.title} | The Radian Journal`,
    description: post.excerpt ?? undefined,
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;

  /*  ⚠️ EVERY ARTICLE COMES FROM THE ADMIN (9 Sep 2026). Three samples used to
      be served from `_data/journal.ts` under Radian's name; `LiveArticle` asks
      the shop and says "not found" when the shop does.  */

  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 flex-wrap py-4 text-[13.5px] text-body-soft"
        >
          <Link href="/" className="hover:text-orchid">
            Home
          </Link>
          <span className="text-lavender-deep">›</span>
          <Link href="/journal" className="hover:text-orchid">
            Journal
          </Link>
          <span className="text-lavender-deep">›</span>
          <span className="text-purple font-semibold truncate max-w-[220px]">
            Article
          </span>
        </nav>

        <div className="pt-4 pb-16">
          <LiveArticle slug={slug} />
        </div>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
