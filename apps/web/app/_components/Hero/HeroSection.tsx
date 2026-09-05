"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Zone } from "../../_store/useZoneStore";
import { getShopBanners, zoneCode, type ShopBanner } from "../../_data/shop";

/*
  Hero — the banner slider at the top of the homepage.

  Everything on it is the admin's (Homepage → Banners, placement HERO): the
  picture, the small line, the headline in two parts,
  the description, both buttons, the proof lines, the two floating cards and
  their on/off, the zone, the schedule, the order and the on/off of each slide.
  The API applies zone and schedule, so what arrives is what this visitor
  should see. Nothing here is typed in: no seeded slide, no drawn stand-in
  art. While the answer is on its way the section holds its height, empty;
  when the answer is "no hero banner", the section is not drawn at all.

  ── one composition to the bottom of the trust strip (owner, 4 Sep 2026) ───
  Header → hero → trust strip is ONE first screen. On desktop the section is
  exactly one viewport tall under the header (floored and capped), the copy
  centres in the band, and the picture is a bottom-anchored <img> that fills
  the right half down to the top of the trust strip — no arch, no mask, no
  tint, no fade. It is fitted inside that half (contain, bottom-anchored),
  so nothing in it is ever cut. The admin's upload has its background cut out and its
  transparent margins trimmed (media.ts), so the flowers stand on the strip,
  on the banner's own background, as the reference shows. Phones use the SAME
  picture (owner: one picture, no separate mobile artwork), full width above
  the words, cropped to 4:3 by CSS and aimed a little above its bottom edge.

  The trust strip, when it is the next block, sits in the section's foot
  (`--hero-foot`) — see TrustStrip's `overlapsHero`. The picture runs under
  it, so the strip is the picture's bottom edge and the bouquet never ends in
  a hard line.
*/

interface Props {
  zone: Zone | null;
  /** the trust strip is the next block — leave it a foot to sit in */
  stripFollows?: boolean;
}

/*  Foot = the room the trust strip sits in: the strip card (90px) plus the
    margin under it. Owner, 4 Sep 2026: nothing may show under the strip — the
    first screen ends with the strip, not with a slice of picture. TrustStrip
    reads the same constant.  */
export const HERO_FOOT = "106px";

function ArrowIcon() {
  return (
    <svg className="w-4 h-4 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
      <path d="M4 12h16m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FloatIcon({ name }: { name: string }) {
  const cls = "w-[18px] h-[18px] stroke-current fill-none stroke-[1.8]";
  if (name === "bolt")
    return <svg className={cls} viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === "heart")
    return <svg className={cls} viewBox="0 0 24 24"><path d="M12 20.3S4 15 4 9.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8 2.9c0 5.4-8 10.7-8 10.7z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === "truck")
    return <svg className={cls} viewBox="0 0 24 24"><path d="M2 6h12v11H2zM14 10h4l3 3.4V17h-7" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6.5" cy="17.7" r="1.8" /><circle cx="17.5" cy="17.7" r="1.8" /></svg>;
  return <svg className={cls} viewBox="0 0 24 24"><rect x="4" y="9" width="16" height="4" strokeLinecap="round" strokeLinejoin="round" /><path d="M5.5 13v7h13v-7M12 9v11M12 9C9 9 7.2 7.6 7.6 5.8 8 4.2 10.4 4 12 6.6 13.6 4 16 4.2 16.4 5.8 16.8 7.6 15 9 12 9z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/**
 * A floating card. Hidden when switched off in the admin, and also when both
 * lines are empty — an empty card is a white box over the photograph for no
 * reason. Desktop only; on a phone the picture is the whole width and a card
 * on it would cover the flowers.
 */
function FloatCard({
  card,
  className,
}: {
  card: { show: boolean; icon: string; title: string; sub: string };
  className: string;
}) {
  if (!card.show || (!card.title && !card.sub)) return null;
  return (
    <div className={`absolute z-10 hidden lg:flex items-center gap-3.5 bg-white/96 backdrop-blur-sm rounded-[20px] pl-3.5 pr-[18px] py-3.5 shadow-lift whitespace-nowrap ${className}`}>
      {card.icon && (
        <div className="w-[46px] h-[46px] rounded-[14px] bg-orchid-soft flex items-center justify-center text-purple shrink-0">
          <FloatIcon name={card.icon} />
        </div>
      )}
      <div>
        {card.title && <b className="block text-[15px] text-ink font-semibold leading-tight">{card.title}</b>}
        {card.sub && <span className="text-[12.5px] text-body-soft">{card.sub}</span>}
      </div>
    </div>
  );
}

/**
 * A proof line is one admin string. "3 Hours Delivery · Inside Dhaka" renders
 * as a bold line with a small one under it; a string without " · " is one
 * bold line. Display only — nothing reads the split back.
 */
function splitProof(item: string): { title: string; sub: string } {
  const i = item.indexOf(" · ");
  return i < 0 ? { title: item, sub: "" } : { title: item.slice(0, i), sub: item.slice(i + 3) };
}

const card = (b: ShopBanner, n: 1 | 2) => ({
  show: n === 1 ? b.float1Show : b.float2Show,
  icon: (n === 1 ? b.float1Icon : b.float2Icon) ?? "",
  title: (n === 1 ? b.float1Title : b.float2Title) ?? "",
  sub: (n === 1 ? b.float1Sub : b.float2Sub) ?? "",
});

export default function HeroSection({ zone, stripFollows = false }: Props) {
  /** null = not answered yet; [] = the shop has no hero banner for this zone */
  const [banners, setBanners] = useState<ShopBanner[] | null>(null);
  const [rotateMs, setRotateMs] = useState(6000);
  const [index, setIndex] = useState(0);

  /*  The section is one viewport tall UNDER the sticky header, and the header
      is not a fixed height (the announcement bar can be off). Measure it
      rather than guess it.  */
  const [headerH, setHeaderH] = useState(154);
  useEffect(() => {
    const el = document.querySelector("header");
    if (!el) return;
    const read = () => setHeaderH(Math.round(el.getBoundingClientRect().height));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    getShopBanners(zoneCode(zone)).then((res) => {
      if (!alive) return;
      // a failed call keeps whatever was on screen; a blank hero on a network
      // blip is worse than a stale one
      if (res === null) { setBanners((b) => b ?? []); return; }
      setBanners(res.banners.filter((b) => b.placement === "HERO"));
      setRotateMs(res.heroRotateSeconds * 1000);
      setIndex(0);
    });
    return () => { alive = false; };
  }, [zone]);

  const count = banners?.length ?? 0;
  useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), rotateMs);
    return () => clearInterval(t);
  }, [count, rotateMs]);

  if (banners !== null && banners.length === 0) return null;

  const foot = stripFollows ? HERO_FOOT : "0px";
  const slides = banners ?? [];

  return (
    <section
      className="overflow-hidden relative lg:flex lg:flex-col lg:min-h-[clamp(560px,calc(100svh_-_var(--hero-header)),min(820px,52vw))] lg:pb-[var(--hero-foot)]"
      style={{
        background:
          "radial-gradient(55% 75% at 78% 28%, rgba(255,255,255,0.55), rgba(255,255,255,0) 70%), linear-gradient(90deg,#faf5fb 0%,#f8f1f8 38%,#f5e8ee 58%,#eedce4 80%,#e2ccd7 100%)",
        ["--hero-header" as string]: `${headerH}px`,
        ["--hero-foot" as string]: foot,
      }}
    >
      {/* ---- Desktop picture: the right half of the section, bottom-anchored, one per slide (crossfade) ---- */}
      {slides.map((c, slideIndex) =>
        c.imageUrl ? (
          <div
            key={`pic-${c.id}`}
            aria-hidden
            className={`hidden lg:block absolute top-0 bottom-[var(--hero-foot)] left-1/2 right-0 transition-opacity duration-1000 ease-in-out ${slideIndex === index ? "opacity-100" : "opacity-0"}`}
          >
            {/* contain, not cover: the cut-out must never lose its top or sides;
                it stands on the strip, centred in the right half */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.imageUrl} alt="" className="w-full h-full object-contain object-bottom" />
          </div>
        ) : null,
      )}

      {/* ---- The floating cards, per slide, against the SECTION (a slide's own
          translate would make it their containing block and pin card 1 to the
          copy column): one at the top-right corner, one low on the picture's
          left edge, where the reference puts them. ---- */}
      {slides.map((c, slideIndex) => (
        <div
          key={`cards-${c.id}`}
          aria-hidden={slideIndex !== index}
          className={`contents transition-opacity duration-1000 ${slideIndex === index ? "" : "[&>*]:opacity-0 [&>*]:pointer-events-none"}`}
        >
          <FloatCard card={card(c, 1)} className="top-6 right-[calc(3.6vw_+_14px)] transition-opacity duration-1000" />
          <FloatCard card={card(c, 2)} className="left-[calc(50%_+_3.7vw)] bottom-[calc(var(--hero-foot)_+_3.6vw)] max-w-[300px] transition-opacity duration-1000" />
        </div>
      ))}

      <div className="max-w-[var(--page-w)] mx-auto px-6 w-full lg:flex-1 lg:flex lg:flex-col">
        {/* While the answer is on its way: the band, empty, at its full height */}
        {banners === null && <div className="min-h-[420px] lg:flex-1" aria-hidden />}

        {/* All slides stacked in one grid cell — smooth crossfade between them */}
        <div className="grid lg:flex-1 lg:grid-rows-[1fr]">
          {slides.map((c, slideIndex) => (
        <div
          key={c.id}
          aria-hidden={slideIndex !== index}
          className={`col-start-1 row-start-1 grid grid-cols-1 lg:grid-cols-[minmax(0,600px)_1fr] gap-6 items-center pt-5 pb-6 lg:pt-6 lg:pb-5 transition-all duration-1000 ease-in-out ${
            slideIndex === index
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 pointer-events-none"
          }`}
        >
          {/* ---- Phones: the same picture, above the words, full width. Desktop hides it. ---- */}
          {c.imageUrl && (
            <div className="lg:hidden -mx-6 -mt-5 aspect-[4/3] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.imageUrl} alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 62%" }} />
            </div>
          )}

          {/* ---- Left: copy ---- */}
          <div className="relative z-[1]">
            {c.eyebrow && (
              <div className="flex items-center gap-3 text-[12px] tracking-[0.22em] uppercase font-semibold text-orchid mb-5 whitespace-nowrap">
                <span>{c.eyebrow}</span>
                <span className="w-9 h-px bg-orchid/70 shrink-0" />
              </div>
            )}

            {(c.titleMain || c.titleAccent) && (
              <h1
                className="font-display font-medium text-purple leading-[1.06] tracking-[-0.02em] mb-[18px] [overflow-wrap:anywhere]"
                style={{ fontSize: "clamp(34px, 4.4vw, 56px)" }}
              >
                {c.titleMain}{c.titleMain && c.titleAccent ? " " : ""}
                {c.titleAccent && (
                  <em className="not-italic bg-gradient-to-r from-orchid to-[#9b2fc4] bg-clip-text text-transparent">{c.titleAccent}</em>
                )}
              </h1>
            )}

            {c.lead && (
              <p className="text-[16px] lg:text-[18px] font-light text-body max-w-[46ch] mb-7 leading-[1.55] [overflow-wrap:anywhere]">
                {c.lead}
              </p>
            )}

            {(c.cta1Label || c.cta2Label) && (
              <div className="flex gap-4 flex-wrap items-center">
                {c.cta1Label && (
                  <Link
                    href={c.cta1Href ?? "/products"}
                    className="inline-flex items-center gap-3 h-[54px] lg:h-[58px] px-7 lg:px-[34px] bg-purple text-white rounded-full font-semibold text-[15px] lg:text-[16px] tracking-[0.01em] shadow-[0_14px_30px_rgba(71,0,102,0.22)] hover:bg-purple-deep hover:-translate-y-0.5 transition-all whitespace-nowrap"
                  >
                    {c.cta1Label} <ArrowIcon />
                  </Link>
                )}
                {c.cta2Label && (
                  <Link
                    href={c.cta2Href ?? "/products"}
                    className="inline-flex items-center gap-3 h-[54px] lg:h-[58px] px-7 lg:px-[34px] bg-white text-purple border-[1.5px] border-purple rounded-full font-semibold text-[15px] lg:text-[16px] hover:bg-purple hover:text-white transition-all whitespace-nowrap"
                  >
                    {c.cta2Label}
                  </Link>
                )}
              </div>
            )}

            {c.proof.length > 0 && (
              <div className="flex mt-7 flex-wrap gap-y-3">
                {c.proof.filter(Boolean).map(splitProof).map((item, i) => (
                  <div key={item.title} className={`flex items-center gap-2.5 pr-[18px] whitespace-nowrap ${i > 0 ? "border-l border-[#dccde8] pl-[18px]" : ""}`}>
                    <span className="w-2 h-2 rounded-[50%_50%_50%_0] rotate-[-45deg] block shrink-0 bg-orchid" />
                    <div>
                      <b className="block text-[14px] font-semibold text-purple leading-tight">{item.title}</b>
                      {item.sub && <span className="text-[12.5px] text-body-soft">{item.sub}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- Right column: the picture's room on desktop (the picture itself is the section's) ---- */}
          <div className="hidden lg:block h-full min-h-[420px]" />

        </div>
          ))}
        </div>

        {/* ---- Dots ---- */}
        {slides.length > 1 && (
          <div className="flex justify-center gap-[9px] pb-4">
            {slides.map((b, i) => (
              <button
                key={b.id}
                aria-label={`Banner ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-[9px] rounded-full transition-all duration-300 cursor-pointer ${
                  i === index ? "w-7 bg-purple" : "w-[9px] bg-orchid-mid hover:bg-orchid"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
