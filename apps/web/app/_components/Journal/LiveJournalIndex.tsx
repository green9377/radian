"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import JournalIndex from "./JournalIndex";
import { getJournal, type JournalCard } from "../../_data/shop";

/*
  /journal — the shop's real articles when it has any, the sample set when it
  does not.

  ⚠️ WHY THE SAMPLES ARE STILL SHOWN WHEN THE JOURNAL IS EMPTY, when the
  homepage rail hides itself instead:

    · On the HOMEPAGE, the journal is one section among twelve. Removing it
      leaves a complete page, and showing invented articles there advertises
      reading the shop does not have.
    · HERE, the whole page is the journal. An empty /journal is a dead end
      reached from the footer of every page — and the sample set already carries
      its own "Draft — placeholder articles" banner saying exactly what it is.

  The moment one real article is published, the samples disappear entirely.
*/

export default function LiveJournalIndex() {
  const [posts, setPosts] = useState<JournalCard[] | null>(null);

  useEffect(() => {
    let alive = true;
    getJournal().then((p) => { if (alive && p) setPosts(p); });
    return () => { alive = false; };
  }, []);

  if (posts === null) return <JournalIndex />;      // still loading
  if (posts.length === 0) return <JournalIndex />;  // nothing published yet

  const [featured, ...rest] = posts;

  return (
    <div className="max-w-[1100px] mx-auto">
      <Link
        href={`/journal/${featured.slug}`}
        className="grid grid-cols-1 md:grid-cols-2 gap-7 mb-12 group"
      >
        <div
          className="aspect-[4/3] rounded-[24px] bg-cover bg-center shadow-soft transition-transform duration-300 group-hover:-translate-y-[5px]"
          style={featured.coverUrl
            ? { backgroundImage: `url(${featured.coverUrl})` }
            : { background: "linear-gradient(150deg,#F5E2F0,#E5BEDD)" }}
        />
        <div className="self-center">
          <Meta post={featured} />
          <h2 className="font-display text-[clamp(24px,3vw,32px)] font-medium text-purple leading-[1.2] mt-2 mb-3">
            {featured.title}
          </h2>
          {featured.excerpt && <p className="text-[15px] text-body-soft leading-[1.7]">{featured.excerpt}</p>}
          <span className="inline-block text-[14px] font-semibold text-purple mt-4 group-hover:text-orchid">
            Read article →
          </span>
        </div>
      </Link>

      {rest.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[22px]">
          {rest.map((p, i) => (
            <Link
              key={p.slug}
              href={`/journal/${p.slug}`}
              className="bg-white rounded-[24px] overflow-hidden shadow-soft transition-all duration-300 hover:-translate-y-[6px] hover:shadow-lift"
            >
              <div
                className="h-[180px] bg-cover bg-center"
                style={p.coverUrl
                  ? { backgroundImage: `url(${p.coverUrl})` }
                  : { background: ["linear-gradient(150deg,#F5E2F0,#E5BEDD)", "linear-gradient(150deg,#F1E2F5,#DCC0EA)", "linear-gradient(150deg,#EBDCF4,#D2B6E9)"][i % 3] }}
              />
              <div className="px-5 pt-4 pb-5">
                <Meta post={p} />
                <h3 className="font-display text-[18px] font-medium text-purple mt-1.5 mb-1.5 leading-[1.3]">
                  {p.title}
                </h3>
                {p.excerpt && <p className="text-[13.5px] text-body-soft font-light line-clamp-2">{p.excerpt}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** each part is dropped when it is missing, so a half-filled article still
 *  reads as a line rather than "· · ·" with gaps in it */
function Meta({ post }: { post: JournalCard }) {
  const bits = [
    post.readMinutes ? `${post.readMinutes} min read` : null,
    post.publishedAt
      ? new Date(post.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : null,
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return <div className="text-[12px] text-body-soft">{bits.join(" · ")}</div>;
}
