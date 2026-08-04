"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SectionHead from "../ui/SectionHead";
import { getJournal, type JournalCard } from "../../_data/shop";

/*
  Latest Articles — 3 blog cards.
  Static section; real articles are a launch dependency (blog CMS later).
  Images: gradient placeholders until real photo shoot.
*/

const TINTS = [
  "linear-gradient(150deg,#F5E2F0,#E5BEDD)",
  "linear-gradient(150deg,#F1E2F5,#DCC0EA)",
  "linear-gradient(150deg,#EBDCF4,#D2B6E9)",
];

const FALLBACK_POSTS = [
  {
    tag: "Gifting guide",
    title: "10 Anniversary Flowers by Year",
    excerpt: "From paper to gold — the bloom that matches every milestone.",
    href: "/journal/anniversary-flowers-by-year",
    bg: "linear-gradient(150deg,#F5E2F0,#E5BEDD)",
  },
  {
    tag: "Flower care",
    title: "Keep Roses Fresh for 10 Days",
    excerpt: "Our florists' honest tricks — most people get step one wrong.",
    href: "/journal/keep-roses-fresh",
    bg: "linear-gradient(150deg,#F1E2F5,#DCC0EA)",
  },
  {
    tag: "Occasions",
    title: "The Midnight Surprise Playbook",
    excerpt: "How to plan a 12 AM delivery they will never forget.",
    href: "/journal/midnight-surprise-playbook",
    bg: "linear-gradient(150deg,#EBDCF4,#D2B6E9)",
  },
];

export default function BlogSection() {
  const [posts, setPosts] = useState<JournalCard[] | null>(null);

  /*
    LIVE since 31 Jul 2026. `ContentService` had been finished since the
    Marketing pass with no controller and no module in front of it — everything
    worked and nothing was reachable. That gap is what this section was waiting
    for; see `content.module.ts`.

    ⚠️ THE THREE SAMPLE ARTICLES ARE NOT USED AS A FALLBACK. Like the reviews,
    they were written by whoever built the page — "10 Anniversary Flowers by
    Year" is not an article the shop has. Showing them because the journal is
    empty would advertise reading that does not exist, and each card links to a
    page that would 404.

    So: no posts, no section.
  */
  useEffect(() => {
    let alive = true;
    getJournal().then((p) => { if (alive && p) setPosts(p); });
    return () => { alive = false; };
  }, []);

  if (!posts) return null;           // still loading
  if (posts.length === 0) return null; // nothing published yet

  // the homepage shows the three newest; the rest live on /journal
  const shown = posts.slice(0, 3);

  return (
    <section className="py-[46px]" id="blog">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Section head */}
        <SectionHead
          sectionKey="home.blog"
          eyebrow="From our journal"
          title="Latest Articles"
        />

        {/* Cards — mobile: horizontal swipe · desktop: 3-column grid */}
        <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-[22px] md:overflow-visible md:pb-0">
          {shown.map((post, i) => (
            <Link
              key={post.slug}
              href={`/journal/${post.slug}`}
              className="w-[280px] shrink-0 snap-start md:w-auto md:shrink bg-white rounded-[28px] overflow-hidden shadow-soft transition-all duration-300 hover:-translate-y-[6px] hover:shadow-lift block"
            >
              <div
                className="h-[170px] bg-cover bg-center"
                style={post.coverUrl ? { backgroundImage: `url(${post.coverUrl})` } : { background: TINTS[i % TINTS.length] }}
              />
              <div className="px-6 pt-5 pb-6">
                {/* the reading time takes the place of the old hand-typed
                    category chip — it is worked out from the article itself, so
                    it cannot be forgotten or wrong */}
                {post.readMinutes && (
                  <div className="text-[11px] tracking-[0.18em] uppercase text-orchid font-semibold whitespace-nowrap">
                    {post.readMinutes} min read
                  </div>
                )}
                <h3 className="font-display text-[18px] font-medium text-purple mt-2 mb-[6px] leading-[1.3] whitespace-nowrap overflow-hidden text-ellipsis">
                  {post.title}
                </h3>
                {post.excerpt && (
                  <p className="text-[13.5px] text-body-soft font-light mb-3">{post.excerpt}</p>
                )}
                <span className="text-[13px] font-semibold text-purple whitespace-nowrap">
                  Read article →
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* View all — homepage always shows only the latest 3 */}
        <div className="flex justify-center mt-8">
          <Link
            href="/journal"
            className="inline-flex items-center gap-[10px] px-10 py-[14px] border-[1.5px] border-purple rounded-full text-purple font-medium text-[15px] tracking-[0.04em] transition-all duration-300 hover:bg-purple hover:text-white hover:shadow-lift whitespace-nowrap"
          >
            View All Articles
            <svg className="w-4 h-4 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
              <path d="M4 12h16m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
