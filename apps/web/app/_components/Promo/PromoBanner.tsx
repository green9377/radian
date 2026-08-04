"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Zone } from "../../_store/useZoneStore";
import { getShopBanners, zoneCode } from "../../_data/shop";

/*
  Promo Banner — the seasonal strip.

  LIVE since 30 Jul 2026 — admin-managed, as the old comment here promised it
  would be one day. Shares the Banner table with the hero and the announcement
  line, so scheduling and zone behave identically across all three.
*/

function ArrowIcon() {
  return (
    <svg
      className="w-4 h-4 stroke-current fill-none stroke-[1.8]"
      viewBox="0 0 24 24"
    >
      <path d="M4 12h16m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FALLBACK = {
  eyebrow: "Limited season",
  titleMain: "Valentine's Preview",
  titleAccent: "Collection",
  lead: "Reserve the season's most romantic arrangements before they sell out. Early orders get free midnight delivery.",
  cta1Label: "Explore the collection",
  cta1Href: "/collections/valentines",
  imageUrl: null as string | null,
};

export default function PromoBanner({ zone }: { zone?: Zone | null }) {
  const [c, setC] = useState(FALLBACK);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    getShopBanners(zoneCode(zone ?? null)).then((res) => {
      if (!alive || res === null) return;
      const p = res.banners.find((b) => b.placement === "PROMO");
      /*
        Unlike the hero and the announcement line, this one DOES disappear when
        nothing is live — and that is the point of it. A promo strip is a
        seasonal interruption; between seasons the homepage should simply not
        have one, rather than keep showing Valentine's in July. The other two
        are permanent furniture and so keep their standing content.
      */
      if (!p) { setHidden(true); return; }
      setHidden(false);
      setC({
        eyebrow: p.eyebrow ?? "",
        titleMain: p.titleMain ?? "",
        titleAccent: p.titleAccent ?? "",
        lead: p.lead ?? "",
        cta1Label: p.cta1Label ?? FALLBACK.cta1Label,
        cta1Href: p.cta1Href ?? FALLBACK.cta1Href,
        imageUrl: p.imageUrl,
      });
    });
    return () => { alive = false; };
  }, [zone]);

  if (hidden) return null;

  return (
    <section className="pb-[46px]" id="promo">
      <div className="max-w-[1200px] mx-auto px-6">
        {/*
          Owner's choice, 30 Jul 2026, from three mocked layouts: the picture
          fills the whole strip and fades out under the words.

          The scrim is the entire reason this is safe. Without it, the first
          attempt put pale flowers directly behind purple text and neither could
          be read. It is opaque on the left where the headline sits, and clears
          completely by ~70% so the photograph is never veiled where it matters.
          Tinted with the band's own pink rather than white or black, so a photo
          that does not reach the left edge blends into the design instead of
          looking like a mistake.

          It is only drawn when there IS an image — over the plain gradient it
          would be a wash over a wash.
        */}
        <div
          className="rounded-[28px] overflow-hidden relative min-h-[250px] flex items-center shadow-lift bg-cover bg-center"
          style={
            c.imageUrl
              ? { backgroundImage: `url(${c.imageUrl})` }
              : { background: "linear-gradient(120deg,#FBEFF7 0%,#F3D9EE 50%,#E9C0E8 100%)" }
          }
        >
          {c.imageUrl && (
            <>
              {/* desktop — fades sideways, text left, photograph right */}
              <div
                className="absolute inset-0 hidden md:block"
                style={{
                  background:
                    "linear-gradient(90deg,#FBEFF7 0%,#FBEFF7 30%,rgba(251,239,247,0.82) 46%,rgba(251,239,247,0.35) 60%,rgba(251,239,247,0) 72%)",
                }}
              />
              {/* phone — the text spans the full width, so a sideways fade would
                  leave the last words sitting on the photograph. Fades downward
                  instead: words at the top, picture showing beneath them. */}
              <div
                className="absolute inset-0 md:hidden"
                style={{
                  background:
                    "linear-gradient(180deg,#FBEFF7 0%,rgba(251,239,247,0.93) 55%,rgba(251,239,247,0.55) 100%)",
                }}
              />
            </>
          )}

          <div className="relative z-[2] px-8 py-10 md:px-[54px] md:py-11 max-w-[560px]">
            {c.eyebrow && (
              <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase text-purple font-semibold mb-3 whitespace-nowrap">
                <span className="w-[9px] h-[9px] bg-rosegold rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
                {c.eyebrow}
              </div>
            )}
            <h2 className="font-display text-[clamp(24px,3vw,34px)] text-purple font-medium leading-[1.15] mb-[10px]">
              {c.titleMain} {c.titleAccent && <span className="text-orchid">{c.titleAccent}</span>}
            </h2>
            {c.lead && <p className="text-body font-light mb-[22px] max-w-[42ch]">{c.lead}</p>}
            <Link
              href={c.cta1Href}
              className="inline-flex items-center gap-[10px] px-10 py-4 bg-purple text-white rounded-full font-medium text-[15.5px] tracking-[0.03em] transition-all duration-300 hover:bg-purple-deep hover:-translate-y-[2px] whitespace-nowrap shadow-[0_12px_30px_rgba(71,0,102,0.25)]"
            >
              {c.cta1Label} <ArrowIcon />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
