"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE } from "../../_data/shop";

/*
  An article written in the admin panel.

  ⚠️ WHY THIS SITS BESIDE `ArticleView` RATHER THAN REPLACING IT.
  `ArticleView` renders the sample articles, whose shape is a hand-built object
  with typed sections, pull-quotes and a related-reading rail. A real article
  from the journal is a title, a cover and a block of HTML. Forcing one
  component to render both would mean a pile of optional branches that serve the
  placeholder content — content that is meant to be deleted.

  So: the page tries the sample list first (unchanged), and anything it does not
  recognise comes here.
*/

interface Post {
  slug: string;
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  bodyHtml: string | null;
  author: string | null;
  publishedAt: string | null;
  readMinutes: number | null;
}

export default function LiveArticle({ slug }: { slug: string }) {
  const [post, setPost] = useState<Post | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/content/public/journal?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (!alive) return; p ? setPost(p) : setMissing(true); })
      .catch(() => { if (alive) setMissing(true); });
    return () => { alive = false; };
  }, [slug]);

  if (missing) {
    return (
      <div className="max-w-[760px] mx-auto text-center py-16">
        <h1 className="font-display text-[26px] text-purple mb-2">We could not find that article</h1>
        <p className="text-body-soft text-[14.5px] mb-6">It may have been renamed or taken down.</p>
        <Link href="/journal" className="inline-flex items-center gap-2 px-8 py-3 bg-purple text-white rounded-full font-medium text-[15px] hover:bg-purple-deep transition-all">
          All articles
        </Link>
      </div>
    );
  }

  if (!post) return <div className="max-w-[760px] mx-auto py-16 text-body-soft text-[14px]">Loading…</div>;

  return (
    <article className="max-w-[760px] mx-auto">
      <h1 className="font-display text-[clamp(28px,4vw,40px)] font-medium text-purple leading-[1.15] mb-3">
        {post.title}
      </h1>

      <div className="flex items-center gap-3 text-[13px] text-body-soft mb-7">
        {post.author && <span>{post.author}</span>}
        {post.publishedAt && (
          <>
            {post.author && <span className="text-lavender-deep">·</span>}
            <span>
              {new Date(post.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </>
        )}
        {post.readMinutes && (
          <>
            <span className="text-lavender-deep">·</span>
            <span>{post.readMinutes} min read</span>
          </>
        )}
      </div>

      {post.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.coverUrl} alt="" className="w-full rounded-[24px] mb-8 shadow-soft" />
      )}

      {post.excerpt && (
        <p className="font-display text-[19px] italic text-body leading-[1.6] mb-7">{post.excerpt}</p>
      )}

      {/*
        The body is HTML the shop wrote in its own admin panel — the same trust
        boundary as any CMS. It is not visitor input, and the editor strips
        pasted formatting before it is ever stored.
      */}
      <div
        className="text-[16px] leading-[1.8] text-ink
          [&_h2]:font-display [&_h2]:text-[24px] [&_h2]:text-purple [&_h2]:mt-9 [&_h2]:mb-3
          [&_p]:mb-5 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-5 [&_li]:mb-1.5
          [&_a]:text-orchid [&_a]:underline [&_a]:underline-offset-2
          [&_img]:rounded-[18px] [&_img]:my-7 [&_img]:w-full"
        dangerouslySetInnerHTML={{ __html: post.bodyHtml ?? "" }}
      />

      <div className="mt-12 pt-8 border-t border-lavender-deep">
        <Link href="/journal" className="text-[14px] font-semibold text-purple hover:text-orchid">
          ← All articles
        </Link>
      </div>
    </article>
  );
}
