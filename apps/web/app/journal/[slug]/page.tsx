import type { Metadata } from "next";
import Link from "next/link";

import { ARTICLE_SLUGS, getArticle } from "../../_data/journal";
import ArticleView from "../../_components/Journal/ArticleView";
import LiveArticle from "../../_components/Journal/LiveArticle";
import Reviews from "../../_components/GBE/Reviews";
import VisitStore from "../../_components/GBE/VisitStore";

/*
  একটাই route — সব article এখান দিয়ে যায়: /journal/[slug]।
  নতুন লেখা যোগ করতে শুধু app/_data/journal.ts-এ একটা object।
  GBE order (locked): Reviews → Visit Store → Footer।
*/

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return ARTICLE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  return {
    title: `${article.title} | The Radian Journal`,
    description: article.excerpt,
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const article = getArticle(slug);

  /*
    A slug the sample list does not know is not automatically wrong — it is very
    likely an article the owner has just written. It goes to LiveArticle, which
    asks the API and shows a proper "not found" only when the API also says no.

    Before this, ANY real article 404'd, because the only list of slugs was the
    hand-written one in _data/journal.ts.
  */

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
            {article?.title ?? "Article"}
          </span>
        </nav>

        <div className="pt-4 pb-16">
          {article ? <ArticleView article={article} /> : <LiveArticle slug={slug} />}
        </div>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
