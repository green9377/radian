"use client";

import { useState } from "react";
import Link from "next/link";
import ShopIcon from "../ui/ShopIcon";

/*
  About Radian — the story card on the homepage (owner's reference, 5 Sep
  2026): the words on the left with a highlighted line, small icon points and
  a button; the picture on the right in a soft arch; beside it a handwritten
  line, three little cards and a caption.

  Every word, the icons, the picture and the link are the section's own
  settings (Storefront → Homepage → Layout → About Radian). Nothing is typed
  in here: a part the owner leaves empty is simply not drawn, and with no
  heading and no story the section is not drawn at all.
*/

type IconRow = { icon: string; title: string; sub: string };
const rows = (v: unknown): IconRow[] => (Array.isArray(v) ? (v as IconRow[]) : []);

function Tile({ icon, tone = "lavender" }: { icon: string; tone?: "lavender" | "white" }) {
  return (
    <span className={`w-11 h-11 rounded-full grid place-items-center shrink-0 text-purple ${tone === "white" ? "bg-white shadow-soft" : "bg-lavender"}`}>
      <ShopIcon name={icon} className="w-[22px] h-[22px]" />
    </span>
  );
}

/*
  The ARTICLE variant (category pages, owner 5 Sep 2026): the same words,
  centred in a narrow column, smaller, nothing beside them — no picture, no
  cards, no caption. The first paragraph shows; the rest sits behind "Read
  more". The whole text is always in the page (Google reads all of it); only
  the eye is spared.
*/
function Article({ eyebrow, title, paragraphs }: { eyebrow: string; title: string; paragraphs: string[] }) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = paragraphs;
  return (
    <section className="py-[var(--section-y)]" id="story">
      <div className="max-w-[var(--page-w)] mx-auto px-6">
        <div className="max-w-[820px] mx-auto text-center">
          {eyebrow && (
            <div className="inline-flex items-center gap-3 text-[12px] tracking-[0.22em] uppercase font-semibold text-orchid">
              <span className="w-8 h-px bg-orchid/60" />
              {eyebrow}
              <span className="w-8 h-px bg-orchid/60" />
            </div>
          )}
          {title && (
            <h2 className="font-display text-[clamp(24px,2.6vw,32px)] font-medium leading-[1.2] text-purple mt-3 [overflow-wrap:anywhere]">{title}</h2>
          )}
          <div className="mt-4 text-[15px] leading-[1.75] text-body space-y-3">
            {first && <p>{first}</p>}
            {rest.length > 0 && (
              <div className={`space-y-3 ${open ? "" : "hidden"}`} aria-hidden={!open}>
                {rest.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            )}
          </div>
          {rest.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="mt-4 inline-flex items-center gap-2 text-[14px] font-semibold text-purple hover:text-orchid transition-colors cursor-pointer"
            >
              {open ? "Show less" : "Read more"} <span aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default function AboutSection({ config = {}, id = "about", variant = "card" }: { config?: Record<string, unknown>; id?: string; variant?: "card" | "article" }) {
  const eyebrow = String(config.eyebrow ?? "");
  const title = String(config.title ?? "");
  const body = String(config.body ?? "");
  const highlightBold = String(config.highlightBold ?? "");
  const highlightText = String(config.highlightText ?? "");
  const highlightIcon = String(config.highlightIcon ?? "");
  const features = rows(config.features);
  const ctaText = String(config.ctaText ?? "");
  const ctaHref = String(config.ctaHref || "/about");
  const imageUrl = String(config.imageUrl ?? "");
  const scriptLine = String(config.scriptLine ?? "");
  const stats = rows(config.stats);
  const sideCaption = String(config.sideCaption ?? "");

  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (!title && paragraphs.length === 0) return null;
  if (variant === "article") return <Article eyebrow={eyebrow} title={title} paragraphs={paragraphs} />;

  const hasSide = Boolean(imageUrl || scriptLine || stats.length || sideCaption);

  return (
    <section className="py-[var(--section-y)]" id={id}>
      <div className="max-w-[var(--page-w)] mx-auto px-6">
        <div
          className={`rounded-[28px] shadow-soft p-6 lg:p-9 grid grid-cols-1 gap-8 items-center ${hasSide ? "lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]" : ""}`}
          style={{ background: "linear-gradient(140deg,#fbf8fd 0%,#f5eef9 100%)" }}
        >
          {/* ---- the words ---- */}
          <div>
            {eyebrow && (
              <div className="flex items-center gap-3 text-[12px] tracking-[0.22em] uppercase font-semibold text-purple/80">
                <span className="w-9 h-px bg-purple/60" />
                {eyebrow}
              </div>
            )}
            {title && (
              <h2 className="font-display text-[clamp(26px,3vw,36px)] font-medium leading-[1.15] text-purple mt-3 [overflow-wrap:anywhere]">
                {title}
              </h2>
            )}
            {paragraphs.length > 0 && (
              <div className="mt-4 space-y-3 text-[15px] leading-[1.65] text-body max-w-[66ch]">
                {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            )}
            {(highlightBold || highlightText) && (
              <div className="mt-5 flex items-center gap-4 rounded-[18px] bg-lavender px-5 py-3.5 max-w-[760px]">
                {highlightIcon && <Tile icon={highlightIcon} tone="white" />}
                <p className="text-[15px] leading-[1.55] text-body">
                  {highlightBold && <b className="font-semibold text-purple">{highlightBold}</b>}
                  {highlightBold && highlightText ? " " : ""}
                  {highlightText}
                </p>
              </div>
            )}
            {features.length > 0 && (
              <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-3 max-w-[900px]">
                {features.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 min-w-0">
                    {f.icon && <Tile icon={f.icon} />}
                    <div className="min-w-0 text-[13.5px] leading-[1.3]">
                      {f.title && <b className="block font-semibold text-purple">{f.title}</b>}
                      {f.sub && <span className="block text-body">{f.sub}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {ctaText && (
              <Link
                href={ctaHref}
                className="inline-flex items-center gap-3 h-[50px] px-7 mt-6 bg-purple text-white rounded-full font-semibold text-[15.5px] shadow-[0_14px_30px_rgba(71,0,102,0.22)] hover:bg-purple-deep hover:-translate-y-[2px] transition-all whitespace-nowrap"
              >
                {ctaText} <span aria-hidden>→</span>
              </Link>
            )}
          </div>

          {/* ---- the picture and what sits beside it ---- */}
          {hasSide && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-5 items-stretch">
              {imageUrl ? (
                <div className="relative overflow-hidden min-h-[340px] lg:min-h-[440px]" style={{ borderRadius: "120px 24px 120px 24px" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                </div>
              ) : (
                <div />
              )}
              <div className="flex flex-col justify-between items-end gap-6 w-[210px] text-right">
                {scriptLine ? (
                  <span className="font-display italic text-[24px] leading-[1.15] text-purple/85 max-w-[10ch]">{scriptLine} <span className="not-italic text-orchid">♡</span></span>
                ) : <span />}
                {stats.length > 0 && (
                  <div className="space-y-2.5 w-full">
                    {stats.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 bg-white rounded-[16px] px-4 py-3 shadow-soft text-left">
                        {s.icon && <Tile icon={s.icon} />}
                        <div className="min-w-0 leading-tight">
                          {s.title && <b className="block text-[15px] font-semibold text-purple">{s.title}</b>}
                          {s.sub && <span className="block text-[12.5px] text-body-soft">{s.sub}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {sideCaption ? (
                  <span className="text-[11px] tracking-[0.22em] uppercase text-body-soft leading-[1.9] max-w-[14ch] border-b border-purple/40 pb-2">{sideCaption}</span>
                ) : <span />}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
