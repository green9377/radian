import Link from "next/link";
import { ARTICLES, JOURNAL_DRAFT } from "../../_data/journal";

/*
  JournalIndex — /journal (server component)।
  Hero → featured (first article, wide) → rest as card grid।
  draft হলে banner। cover = gradient placeholder (real photo পরে)।
*/

function Petal({ className = "" }: { className?: string }) {
  return (
    <span className={`bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block ${className}`} />
  );
}

function Meta({ category, readMins, date }: { category: string; readMins: number; date: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-body-soft flex-wrap">
      <span className="text-orchid font-semibold uppercase tracking-[0.1em]">{category}</span>
      <span className="text-lavender-deep">·</span>
      <span>{readMins} min read</span>
      <span className="text-lavender-deep">·</span>
      <span>{date}</span>
    </div>
  );
}

export default function JournalIndex() {
  const [featured, ...rest] = ARTICLES;

  return (
    <div className="max-w-[1100px] mx-auto">
      {JOURNAL_DRAFT && (
        <div className="max-w-[860px] mx-auto bg-[#FFF7E8] border border-[#F2D9A8] text-[#8A5A00] rounded-[14px] px-4 py-3 mb-8 text-[13px]">
          <b>Draft.</b> Placeholder articles — Radian to replace with its own
          stories and guides before launch.
        </div>
      )}

      {/* Hero */}
      <header className="text-center max-w-[720px] mx-auto mb-10">
        <div className="mb-4 flex justify-center">
          <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase text-orchid font-semibold whitespace-nowrap">
            <Petal className="w-[9px] h-[9px]" />
            The Radian Journal
          </div>
        </div>
        <h1 className="font-display text-[clamp(30px,4.6vw,46px)] font-medium text-purple leading-[1.12]">
          Stories, guides & gifting ideas
        </h1>
        <p className="text-[17px] leading-[1.7] text-body font-light mt-5">
          Flower care, thoughtful gifting, and the little details that make a
          moment land — from the people who arrange your gifts by hand.
        </p>
      </header>

      {/* Featured */}
      {featured && (
        <Link
          href={`/journal/${featured.slug}`}
          className="group block bg-white rounded-[24px] border border-lavender-deep shadow-soft overflow-hidden mb-10 transition-all duration-300 hover:-translate-y-[3px] hover:shadow-lift"
        >
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_.95fr]">
            <div className="relative min-h-[220px] lg:min-h-full">
              <div className="absolute inset-0" style={{ background: featured.cover }} />
              <span className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm text-purple text-[11.5px] font-semibold uppercase tracking-[0.1em] rounded-full px-3 py-1.5 shadow-lift">
                Featured
              </span>
            </div>
            <div className="px-7 sm:px-9 py-8 flex flex-col justify-center">
              <Meta category={featured.category} readMins={featured.readMins} date={featured.date} />
              <h2 className="font-display text-[clamp(22px,2.8vw,30px)] font-medium text-purple leading-[1.2] mt-3">
                {featured.title}
              </h2>
              <p className="text-[15px] leading-[1.7] text-body-soft font-light mt-3">
                {featured.excerpt}
              </p>
              <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-orchid mt-5 group-hover:gap-2.5 transition-all">
                Read article
                <svg className="w-4 h-4 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
                  <path d="M4 12h16m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </div>
        </Link>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {rest.map((a) => (
          <Link
            key={a.slug}
            href={`/journal/${a.slug}`}
            className="group block bg-white rounded-[22px] border border-lavender-deep shadow-soft overflow-hidden transition-all duration-300 hover:-translate-y-[3px] hover:shadow-lift"
          >
            <div className="relative h-[170px]">
              <div className="absolute inset-0" style={{ background: a.cover }} />
            </div>
            <div className="px-6 py-6">
              <Meta category={a.category} readMins={a.readMins} date={a.date} />
              <h3 className="font-display text-[19px] font-medium text-purple leading-[1.25] mt-2.5">
                {a.title}
              </h3>
              <p className="text-[13.5px] leading-[1.65] text-body-soft font-light mt-2">
                {a.excerpt}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
