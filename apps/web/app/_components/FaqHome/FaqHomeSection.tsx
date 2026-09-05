"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SectionHead from "../ui/SectionHead";
import { getContentFaqs, type FaqGroupLive } from "../../_data/content";

/*
  Questions people ask — the FAQ accordion on the homepage (owner's
  reference, 5 Sep 2026, without the help button and the picture).

  The questions and answers are the ones written under Pages & FAQs —
  published, in their order, one group or all of them. The words around
  them (the handwritten line, the text under it, the line at the bottom, the
  link) and how many to show are the section's own settings. Nothing is
  typed in here; with no published question the section is not drawn.
*/

function Sprig({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 200" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M60 195c0-60 6-110 30-150" />
      <path d="M62 150c-18-4-32-18-36-38 18 2 32 16 36 38zM70 118c14-10 20-26 18-44-14 8-22 24-18 44zM66 90c-14-6-24-18-26-34 14 4 24 16 26 34zM76 62c8-12 10-26 6-40-10 8-14 22-6 40z" />
    </svg>
  );
}

function Leaf() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-orchid fill-none stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21V9M12 9c-4 0-7-3-7-7 4 0 7 3 7 7zM12 12c4 0 7-3 7-7-4 0-7 3-7 7z" />
    </svg>
  );
}

export default function FaqHomeSection({ config = {} }: { config?: Record<string, unknown> }) {
  const group = String(config.group ?? "");
  const count = Math.min(Math.max(Number(config.count) || 7, 2), 12);
  const scriptLine = String(config.scriptLine ?? "");
  const sideText = String(config.sideText ?? "");
  const footerLine = String(config.footerLine ?? "");
  const linkText = String(config.linkText ?? "");
  const linkHref = String(config.linkHref || "/faq");

  const [groups, setGroups] = useState<FaqGroupLive[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    getContentFaqs().then((g) => { if (alive && g) setGroups(g); });
    return () => { alive = false; };
  }, []);

  if (!groups) return null;
  const items = (group ? groups.filter((g) => g.name === group) : groups)
    .flatMap((g) => g.items)
    .slice(0, count);
  if (items.length === 0) return null;

  const hasSide = Boolean(scriptLine || sideText);

  return (
    <section className="relative py-[var(--section-y)] overflow-hidden" id="faq">
      {/* two faint sprigs at the edges, like the reference */}
      <Sprig className="hidden xl:block absolute -left-4 top-24 w-[120px] h-[200px] text-orchid-mid/40 pointer-events-none" />
      <Sprig className="hidden xl:block absolute -right-4 top-24 w-[120px] h-[200px] text-orchid-mid/40 pointer-events-none -scale-x-100" />

      <div className="max-w-[var(--page-w)] mx-auto px-6 relative">
        <SectionHead
          sectionKey="home.faq"
          eyebrow="FAQs for Radian Flower & Gift Shop"
          title="Questions people ask before they order"
          subtitle={"Find quick answers to common questions about ordering, delivery, customization, and more."}
        />

        <div className={`grid grid-cols-1 gap-8 ${hasSide ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)]" : ""}`}>
          {hasSide && (
            <div className="lg:pt-4 lg:pl-8">
              {scriptLine && (
                <div className="font-display italic text-[34px] leading-[1.05] text-purple">
                  {scriptLine} <span className="not-italic text-orchid">♡</span>
                </div>
              )}
              {sideText && <p className="text-[15px] leading-[1.65] text-body mt-4 max-w-[26ch]">{sideText}</p>}
            </div>
          )}

          <div>
            <div className="space-y-2">
              {items.map((f, i) => {
                const on = open === i;
                return (
                  <div key={i} className={`bg-white rounded-[18px] border transition-all duration-200 ${on ? "border-orchid/50 shadow-lift" : "border-lavender-deep shadow-soft"}`}>
                    <button
                      type="button"
                      onClick={() => setOpen(on ? null : i)}
                      aria-expanded={on}
                      className="w-full flex items-center gap-4 text-left px-2.5 py-2 cursor-pointer"
                    >
                      <span className={`w-10 h-10 rounded-full grid place-items-center shrink-0 font-display text-[14.5px] font-medium transition-colors ${on ? "bg-purple text-white" : "bg-lavender text-purple"}`}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1 font-display text-[17px] lg:text-[18px] font-medium text-purple leading-snug">{f.q}</span>
                      <span className={`w-7 h-7 rounded-full border-[1.5px] border-purple grid place-items-center shrink-0 mr-2 transition-transform duration-300 ${on ? "rotate-45 bg-purple text-white" : "text-purple"}`}>
                        <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-current fill-none stroke-[2]"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
                      </span>
                    </button>
                    <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                      <div className="overflow-hidden">
                        <div
                          className="pl-[66px] pr-12 pb-4 text-[14.5px] leading-[1.65] text-body [&_a]:text-orchid [&_a]:underline [&_p+p]:mt-2"
                          dangerouslySetInnerHTML={{ __html: f.aHtml }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {linkText && (
              <div className="mt-3">
                <Link href={linkHref} className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-purple hover:text-orchid transition-colors">
                  {linkText} <span aria-hidden>→</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {footerLine && (
          <div className="flex items-center justify-center gap-5 mt-7">
            <span className="w-[110px] h-px bg-purple/40" />
            <Leaf />
            <span className="w-[110px] h-px bg-purple/40" />
          </div>
        )}
        {footerLine && (
          <p className="text-center text-[12px] tracking-[0.26em] uppercase text-body-soft mt-3">{footerLine}</p>
        )}
      </div>
    </section>
  );
}
