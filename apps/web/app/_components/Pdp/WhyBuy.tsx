"use client";

import { useEffect, useState } from "react";

import { getShopReviews } from "../../_data/shop";
import { asIconName } from "../../_data/productDetails";
import Icon from "./PdpIcons";

/*
  ═══════════════════════════════════════════════════════════════════════════
  THE PROMISE BAND — "Why buy from us", option D, the owner's choice
  (23 August 2026: *"d option ta sundor ata rakho"*).

  ── Why it exists at all ────────────────────────────────────────────────────
  He wrote these cards on the category and then could not find them on the
  page: *"why buy from us ata product upload page a jay nai."* They were
  rendering — 1,400 pixels down, small and grey, at the bottom of the
  "What's inside" specification table, inside a closed accordion. On a phone
  almost nobody ever opened it.

  ── Why a coloured band, and not three more white cards ─────────────────────
  Laying the same three white boxes somewhere higher was the obvious answer
  and the wrong one. Looking at the two masters side by side made the real
  fault plain: the shop was saying one thing twice.

      trust badge            "freshness gurnaty"    "2 hours delievry"
      why-buy card           "freshnes"             "very fast delivery in dhaka city"

  Two screens, two places on the page, one message — and a fourth band of the
  same promises would make the page longer and the brand thinner. A brand that
  repeats itself sounds unsure of itself.

  So the two were given different jobs. The trust badges stay a quiet row of
  facts beside the photo — three words each, read in half a second. THIS is
  the shop speaking: full width, in Radian's own colour, so it is the one part
  of the page that is not another product widget. The colour break is the
  point — it stops the eye where a hesitating shopper's eye goes next, the
  moment after the buy box.

  ── Every word here belongs to the shop ─────────────────────────────────────
  The heading arrives as a prop, written on the category (Categories → Why buy
  from us). It shipped hardcoded and was wrong to: house rule 7 says no
  business value lives in code, and a headline on a shop page is as much a
  business value as a price. Blank draws no heading — never a sentence the
  shop did not choose.

  ── The rating line is real or it is absent ─────────────────────────────────
  The Google figures come from the same endpoint the review rail uses, and the
  line is dropped entirely when the shop has not entered them. An invented
  star rating is an invented review with a number on it — the rule the review
  rail already follows, kept here too.

  No address is printed. "A real shop in Gulshan" is a promise the owner types
  as a trust badge; this component does not know it and will not guess it.
  ═══════════════════════════════════════════════════════════════════════════
*/

export default function WhyBuy({
  craft,
  title,
}: {
  craft: { icon: string; title: string; text: string }[];
  /**
   * DEC-WEB-011 — the heading, written on the category. It shipped as the
   * sentence "Why Dhaka sends flowers with Radian" hardcoded right here, and
   * the owner caught it the same day: *"why from us a frontend ja ja show
   * krche agula kichui to akhane customizible option show krse na."* House
   * rule 7 — no business wording lives in code.
   *
   * Blank draws NO heading. A default sentence would be the same fault with a
   * softer name: something the shop never chose, appearing on its pages.
   */
  title?: string | null;
}) {
  const [google, setGoogle] = useState<{
    rating: number;
    count: number | null;
    url: string | null;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    getShopReviews().then((r) => {
      if (alive && r) setGoogle(r.google);
    });
    return () => {
      alive = false;
    };
  }, []);

  /*  Nothing written, nothing drawn. An empty band in the brand colour is
      worse than no band: it reads as a section that failed to load.  */
  const cards = craft.filter((c) => c.title.trim());
  if (cards.length === 0) return null;
  const heading = title?.trim() || "";

  return (
    <section className="relative overflow-hidden rounded-[28px] mb-10 bg-[linear-gradient(120deg,#3b1152,#5c2079_55%,#7a2a94)] text-white px-6 sm:px-9 py-8 sm:py-10">
      {/*  A soft bloom in the corner so the band reads as crafted rather than
          as a flat block of colour. Pointer-events off — it is decoration.  */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 w-[320px] h-[320px] rounded-full opacity-25"
        style={{ background: "radial-gradient(circle,#e9a8f5,transparent 65%)" }}
      />

      <div className="relative">
        {heading ? (
          <>
            <div className="text-[11px] font-bold tracking-[0.24em] uppercase text-[#e9a8f5] mb-2">
              Why buy from us
            </div>
            <h2 className="font-display text-[clamp(21px,2.4vw,27px)] font-medium leading-tight m-0 mb-6 sm:mb-7">
              {heading}
            </h2>
          </>
        ) : null}

        {/*  Two cards must not stretch to half the screen each — `max-w` keeps
            a pair looking deliberate instead of stranded.  */}
        <div className="grid gap-6 sm:gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <div key={c.title} className="flex gap-3.5 items-start">
              <span className="w-11 h-11 rounded-[13px] bg-white/[0.13] grid place-items-center shrink-0">
                {/*  `asIconName` — a name the storefront's icon set does not
                    know draws as a neutral tick rather than as nothing.  */}
                <Icon name={asIconName(c.icon)} className="w-[19px] h-[19px]" />
              </span>
              <span className="min-w-0">
                <b className="block text-[15px] font-bold leading-snug mb-0.5">{c.title}</b>
                <span className="block text-[13px] text-white/70 font-light leading-relaxed">
                  {c.text}
                </span>
              </span>
            </div>
          ))}
        </div>

        {google && (
          <div className="mt-7 pt-5 border-t border-white/[0.16] flex items-center gap-x-3 gap-y-1.5 flex-wrap text-[13px] text-white/80">
            <span className="text-[#ffd85e] tracking-[2px] text-[13px]">★★★★★</span>
            <b className="text-white font-bold">{google.rating.toFixed(1)}</b>
            {google.count !== null && <span>from {google.count} verified Google reviews</span>}
            {google.url && (
              <a
                href={google.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#e9a8f5] font-semibold hover:underline"
              >
                Read them on Google →
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
