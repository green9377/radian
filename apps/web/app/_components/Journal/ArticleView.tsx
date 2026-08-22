import Link from "next/link";
import { ARTICLES, JOURNAL_DRAFT, type Article } from "../../_data/journal";

/*
  ArticleView — /journal/[slug] (server component)।
  Back link → meta → title → hero band → intro → sections (prose) →
  "more from the journal" → CTA। draft হলে banner।
  Prose কোনো bullet নয় — heading + paragraph (magazine feel)।
*/

function Petal({ className = "" }: { className?: string }) {
  return (
    <span className={`bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block ${className}`} />
  );
}

export default function ArticleView({ article }: { article: Article }) {
  const more = ARTICLES.filter((a) => a.slug !== article.slug).slice(0, 3);

  return (
    <article className="max-w-[760px] mx-auto">
      {JOURNAL_DRAFT && (
        <div className="bg-[#FFF7E8] border border-[#F2D9A8] text-[#8A5A00] rounded-[14px] px-4 py-3 mb-8 text-[13px]">
          <b>Draft.</b> Placeholder article — Radian to replace with its own
          content before launch.
        </div>
      )}

      <Link
        href="/journal"
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-body-soft hover:text-orchid transition-colors mb-6"
      >
        <svg className="w-4 h-4 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
          <path d="M20 12H4m6-6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to the Journal
      </Link>

      {/* Meta + title */}
      <div className="flex items-center gap-2 text-[12px] text-body-soft flex-wrap mb-3">
        <span className="text-orchid font-semibold uppercase tracking-[0.1em]">
          {article.category}
        </span>
        <span className="text-lavender-deep">·</span>
        <span>{article.readMins} min read</span>
        <span className="text-lavender-deep">·</span>
        <span>{article.date}</span>
      </div>
      <h1 className="font-display text-[clamp(28px,4.2vw,42px)] font-medium text-purple leading-[1.14]">
        {article.title}
      </h1>
      <p className="text-[13.5px] text-body-soft mt-4">
        By <span className="text-purple font-medium">{article.author}</span>
      </p>

      {/* Hero band */}
      <div
        className="h-[220px] sm:h-[300px] rounded-[24px] shadow-soft my-8"
        style={{ background: article.cover }}
      />

      {/* Intro */}
      <p className="text-[18px] leading-[1.75] text-body font-light mb-7">
        {article.intro}
      </p>

      {/* Sections */}
      {article.sections.map((s, i) => (
        <section key={i} className="mb-7">
          {s.heading && (
            <h2 className="font-display text-[22px] font-medium text-purple leading-[1.25] mb-3">
              {s.heading}
            </h2>
          )}
          {s.paras.map((p, j) => (
            <p
              key={j}
              className="text-[15.5px] leading-[1.8] text-body font-light mb-4 last:mb-0"
            >
              {p}
            </p>
          ))}
        </section>
      ))}

      {/* CTA */}
      <div className="bg-lavender rounded-[22px] px-7 py-8 text-center my-12">
        <div className="mb-3 flex justify-center">
          <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase text-orchid font-semibold whitespace-nowrap">
            <Petal className="w-[9px] h-[9px]" />
            Ready to send one?
          </div>
        </div>
        <h3 className="font-display text-[24px] font-medium text-purple leading-[1.2]">
          Hand-arranged flowers, delivered fast
        </h3>
        <Link
          href="/fresh-flowers"
          className="inline-flex items-center gap-2 mt-5 px-9 py-[15px] bg-purple text-white rounded-full font-medium text-[15px] transition-all duration-300 hover:bg-purple-deep hover:-translate-y-[2px] hover:shadow-lift"
        >
          Explore our flowers
          <svg className="w-4 h-4 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
            <path d="M4 12h16m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>

      {/* More from the journal */}
      {more.length > 0 && (
        <section className="border-t border-lavender-deep pt-8">
          <h2 className="font-display text-[22px] font-medium text-purple mb-5">
            More from the Journal
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {more.map((a) => (
              <Link
                key={a.slug}
                href={`/journal/${a.slug}`}
                className="group block bg-white rounded-[18px] border border-lavender-deep shadow-soft overflow-hidden transition-all duration-300 hover:-translate-y-[3px] hover:shadow-lift"
              >
                <div className="h-[110px]" style={{ background: a.cover }} />
                <div className="px-5 py-4">
                  <span className="text-[11px] text-orchid font-semibold uppercase tracking-[0.1em]">
                    {a.category}
                  </span>
                  <h3 className="font-display text-[15.5px] font-medium text-purple leading-[1.3] mt-1.5">
                    {a.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
