"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Zone } from "../../_store/useZoneStore";
import { getShopBanners, getGoogleRating, zoneCode, type ShopBanner } from "../../_data/shop";

/*
  Hero — multi-banner slider.
  - Each banner = text + CTA + right-side visual slot (photo via Cloudinary later)
  - Banners are zone-aware; auto-rotate every 6s; dot navigation
  - Banner data is hard-coded for now; the admin panel will manage
    this list later (add/edit/reorder/schedule).
*/

interface Props {
  zone: Zone | null;
}

interface HeroBanner {
  id: string;
  eyebrow: string;
  h1Line1: string;
  h1Line2: string;
  h1Accent: string;
  lead: string;
  cta1: { label: string; href: string };
  cta2: { label: string; href: string };
  proof: string[];
  float1: { icon: string; title: string; sub: string };
  float2: { icon: string; title: string; sub: string };
  visual: { gradient: string; art: "bouquet" | "hearts" | "hamper" };
  /** set once a real photo is uploaded; until then the drawn art shows */
  imageUrl?: string | null;
  /** DEC-PRD-034 — written in the admin, so its words are never rewritten */
  fromAdmin?: boolean;
}

const BANNERS: Record<"dhaka" | "bangladesh", HeroBanner[]> = {
  dhaka: [
    {
      id: "dhaka-2hr",
      /*  ⚠️ NO DURATION IN THE FALLBACK HEADLINE — 3 Aug 2026. This read
          "delivered in **2 hours**" as the largest words on the shop, and the
          admin's fastest service is a three-hour express. The live hero comes
          from the banner table, so this is what shows before it lands and on a
          shop with no banner set up — which is no place for the one promise
          the whole business is judged on.  */
      eyebrow: "Dhaka's fastest flower delivery",
      h1Line1: "Say it with flowers,",
      h1Line2: "delivered while",
      h1Accent: "it still matters",
      lead: "Fresh blooms and thoughtful gifts, hand-arranged in our Dhaka studio and delivered while the moment still matters.",
      cta1: { label: "Send a gift today", href: "/products" },
      cta2: { label: "Shop by occasion", href: "/occasions" },
      proof: ["Express delivery", "Freshness promise", "★ 4.9 on Google"],
      float1: { icon: "bolt", title: "Order placed 2:14 PM", sub: "Delivered 3:58 PM · Gulshan" },
      float2: { icon: "heart", title: '"She cried happy tears"', sub: "Anniversary delivery, Dhanmondi" },
      visual: {
        gradient: "linear-gradient(160deg,#F3E2FA 0%,#E3C4F3 55%,#D5A8EC 100%)",
        art: "bouquet",
      },
    },
    {
      id: "dhaka-valentine",
      eyebrow: "Limited season · Valentine's",
      h1Line1: "Love deserves",
      h1Line2: "more than",
      h1Accent: "one day",
      lead: "Reserve the season's most romantic arrangements early — free midnight delivery on all Valentine's pre-orders.",
      cta1: { label: "Explore the collection", href: "/collections/valentines" },
      cta2: { label: "Midnight delivery", href: "/products" },
      proof: ["Free midnight delivery", "Limited stock", "★ 4.9 on Google"],
      float1: { icon: "heart", title: "Valentine's pre-order", sub: "Free midnight delivery" },
      float2: { icon: "bolt", title: "Delivered at 12:01 AM", sub: "Right at the stroke of midnight" },
      visual: {
        gradient: "linear-gradient(160deg,#FBEFF7 0%,#F3D9EE 50%,#E9C0E8 100%)",
        art: "hearts",
      },
    },
  ],
  bangladesh: [
    {
      id: "bd-nationwide",
      eyebrow: "Nationwide gift delivery",
      h1Line1: "Send love to",
      h1Line2: "",
      h1Accent: "all 64 districts",
      lead: "Courier-safe chocolates, hampers and gift boxes — packed with care in Dhaka, delivered anywhere in Bangladesh in 1–3 days.",
      cta1: { label: "Shop nationwide gifts", href: "/products" },
      cta2: { label: "See what ships nationwide", href: "/categories/chocolates" },
      proof: ["All 64 districts", "Courier-safe packing", "★ 4.9 on Google"],
      float1: { icon: "truck", title: "Ordered from Dhaka", sub: "Delivered to Sylhet · 2 days" },
      float2: { icon: "gift", title: '"Arrived perfectly packed"', sub: "Gift hamper, Chattogram" },
      visual: {
        gradient: "linear-gradient(160deg,#F3E2FA 0%,#E3C4F3 55%,#D5A8EC 100%)",
        art: "hamper",
      },
    },
    {
      id: "bd-premium",
      eyebrow: "Premium hampers",
      h1Line1: "Gifts that travel",
      h1Line2: "as beautifully as",
      h1Accent: "your love",
      lead: "Rose gold tier hampers and signature gift boxes, courier-safe to every district — luxury that arrives looking luxurious.",
      cta1: { label: "Shop premium hampers", href: "/collections/premium" },
      cta2: { label: "Corporate gifting", href: "/occasions/corporate" },
      proof: ["Premium packaging", "Nationwide 1–3 days", "★ 4.9 on Google"],
      float1: { icon: "gift", title: "Rose Gold Hamper", sub: "Bestselling premium pick" },
      float2: { icon: "truck", title: "Courier-safe promise", sub: "Arrives beautiful, always" },
      visual: {
        gradient: "linear-gradient(160deg,#F6EBE4 0%,#EAD2C2 60%,#DDBBA6 100%)",
        art: "hamper",
      },
    },
  ],
};

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
 * Live row → the shape this component has always rendered.
 *
 * `keep` supplies ONLY what the database has no column for: the gradient and
 * the drawn artwork. Those are design, not content — a colour picker on the
 * hero backdrop is how a premium page becomes a ransom note.
 *
 * ⚠️ Every text field is taken as-is, with NO fallback to the seeded slide.
 * The first version did fall back, and it made the screen lie: the API stores
 * a cleared box as null, so "No icon" came back as the old icon and an emptied
 * headline reappeared. A setting the owner cannot turn off is worse than one
 * that does not exist — he changes it, sees no effect, and stops trusting the
 * panel. The seeded rows already hold real content, so there is nothing to
 * protect against here.
 */
function toHeroBanner(b: ShopBanner, keep: HeroBanner): HeroBanner {
  return {
    id: b.id,
    eyebrow: b.eyebrow ?? "",
    h1Line1: b.titleMain ?? "",
    h1Line2: "",
    h1Accent: b.titleAccent ?? "",
    lead: b.lead ?? "",
    cta1: { label: b.cta1Label ?? "", href: b.cta1Href ?? "/products" },
    cta2: { label: b.cta2Label ?? "", href: b.cta2Href ?? "/products" },
    /*  `fromAdmin` marks this slide as the owner's, so the Google rewrite
        below leaves its words alone (DEC-PRD-034).  */
    proof: b.proof ?? [],
    fromAdmin: true,
    float1: { icon: b.float1Icon ?? "", title: b.float1Title ?? "", sub: b.float1Sub ?? "" },
    float2: { icon: b.float2Icon ?? "", title: b.float2Title ?? "", sub: b.float2Sub ?? "" },
    visual: keep.visual,
    imageUrl: b.imageUrl,
  };
}

/**
 * Rewrites any proof chip that quotes Google with the real rating, and drops it
 * when there is none.
 *
 * Matched on the word rather than by position, because the chips are the
 * owner's to write — he may put the Google line first, or not at all, and a
 * hard-coded index would then rewrite the wrong one.
 */
/*  ⚠️ ONLY THE BUILT-IN SLIDES GO THROUGH THIS — DEC-PRD-034, owner 9 Aug 2026.
    He typed "google rating 9:8" into the hero's trust lines and it never
    appeared. This function was the reason: any chip mentioning Google was
    replaced by the real review average, or DELETED when there were no reviews
    — which, on a freshly emptied shop, is always. It was written to stop the
    seeded slides shipping a hard-coded "★ 4.9 on Google", and for those it is
    still right. But the owner's own words are not ours to rewrite: if he types
    it, the shop says it. Applied to the seeded slides, never to his.  */
function withRealRating(rating: number | null) {
  return (chip: string): string => {
    if (!/google/i.test(chip)) return chip;
    return rating ? `★ ${rating.toFixed(1)} on Google` : "";
  };
}

function FloatCard({
  card,
  className,
}: {
  card: { icon: string; title: string; sub: string };
  className: string;
}) {
  if (!card.title && !card.sub) return null;
  return (
    <div className={`absolute z-10 flex items-center gap-3 bg-white/96 backdrop-blur-sm rounded-[18px] px-4 py-3 shadow-lift whitespace-nowrap ${className}`}>
      {card.icon && (
        <div className="w-10 h-10 rounded-full bg-orchid-soft flex items-center justify-center text-orchid shrink-0">
          <FloatIcon name={card.icon} />
        </div>
      )}
      <div>
        {card.title && <b className="block text-[13.5px] text-purple font-semibold">{card.title}</b>}
        {card.sub && <span className="text-[12px] text-body-soft">{card.sub}</span>}
      </div>
    </div>
  );
}

function BannerArt({ art }: { art: HeroBanner["visual"]["art"] }) {
  if (art === "hearts") {
    return (
      <svg viewBox="0 0 200 220" className="w-full max-w-[300px]">
        <path d="M100 190C60 160 30 130 30 95a30 30 0 0 1 55-17 30 30 0 0 1 55 0 30 30 0 0 1 30 17c0 35-30 65-70 95z" fill="#E86FA8" />
        <path d="M100 178C66 152 42 127 42 98a24 24 0 0 1 44-13 24 24 0 0 1 44 0 24 24 0 0 1 28 13c0 29-24 54-58 80z" fill="#F6C4DD" />
        <path d="M100 165C74 145 56 125 56 103a18 18 0 0 1 33-10 18 18 0 0 1 33 0 18 18 0 0 1-4 10c0 22-18 42-18 62z" fill="#CF43EA" opacity=".85" />
        <circle cx="152" cy="60" r="10" fill="#CF43EA" opacity=".5" />
        <circle cx="42" cy="52" r="7" fill="#B76E79" opacity=".5" />
        <circle cx="164" cy="120" r="5" fill="#B76E79" opacity=".6" />
      </svg>
    );
  }
  if (art === "hamper") {
    return (
      <svg viewBox="0 0 200 220" className="w-full max-w-[300px]">
        <path d="M45 100h110l-10 95H55z" fill="#B76E79" />
        <path d="M45 100h110l-3 26H48z" fill="#9A5560" />
        <path d="M70 100c0-40 60-40 60 0" fill="none" stroke="#9A5560" strokeWidth="7" strokeLinecap="round" />
        <circle cx="78" cy="82" r="16" fill="#CF43EA" />
        <circle cx="78" cy="82" r="10" fill="#E9A8F5" />
        <circle cx="104" cy="70" r="18" fill="#E86FA8" />
        <circle cx="104" cy="70" r="11" fill="#F6C4DD" />
        <circle cx="128" cy="84" r="14" fill="#9D2FB5" />
        <circle cx="128" cy="84" r="8" fill="#CF43EA" />
        <rect x="88" y="128" width="24" height="40" rx="4" fill="#E8C9CE" />
        <path d="M100 128v40M88 148h24" stroke="#B76E79" strokeWidth="3" />
      </svg>
    );
  }
  // bouquet (default)
  return (
    <svg viewBox="0 0 200 220" className="w-full max-w-[340px]">
      <path d="M100 130 L64 205 L136 205 Z" fill="#EFD9F0" />
      <path d="M100 130 L74 205 L126 205 Z" fill="#F9EFFA" />
      <ellipse cx="74" cy="110" rx="13" ry="30" fill="#7FA96B" transform="rotate(-32 74 110)" />
      <ellipse cx="126" cy="110" rx="13" ry="30" fill="#7FA96B" transform="rotate(32 126 110)" />
      <ellipse cx="100" cy="98" rx="11" ry="32" fill="#8FB97B" />
      <circle cx="66" cy="96" r="20" fill="#CF43EA" />
      <circle cx="66" cy="96" r="14" fill="#E9A8F5" />
      <circle cx="66" cy="96" r="9" fill="#CF43EA" />
      <circle cx="66" cy="96" r="4" fill="#E9A8F5" />
      <circle cx="134" cy="96" r="20" fill="#B76E79" />
      <circle cx="134" cy="96" r="14" fill="#E8C9CE" />
      <circle cx="134" cy="96" r="9" fill="#B76E79" />
      <circle cx="100" cy="66" r="24" fill="#9D2FB5" />
      <circle cx="100" cy="66" r="17" fill="#CF43EA" />
      <circle cx="100" cy="66" r="10" fill="#9D2FB5" />
      <circle cx="100" cy="66" r="4.5" fill="#CF43EA" />
      <circle cx="84" cy="120" r="16" fill="#E86FA8" />
      <circle cx="84" cy="120" r="11" fill="#F6C4DD" />
      <circle cx="116" cy="120" r="16" fill="#CF43EA" />
      <circle cx="116" cy="120" r="11" fill="#E9A8F5" />
    </svg>
  );
}

export default function HeroSection({ zone }: Props) {
  const fallback = BANNERS[zone === "bangladesh" ? "bangladesh" : "dhaka"];
  const [banners, setBanners] = useState<HeroBanner[]>(fallback);
  const [rotateMs, setRotateMs] = useState(6000);
  const [index, setIndex] = useState(0);
  /*
    The proof chips carried "★ 4.9 on Google" as typed text, in every slide, in
    two components. The owner can set the real figure on the Reviews screen —
    these did not follow it, so correcting 4.9 to 4.7 left the site claiming 4.9
    in three places. Any chip mentioning Google is now rewritten from the real
    number, or dropped when there is none.
  */
  const [rating, setRating] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    getGoogleRating().then((r) => { if (alive && r) setRating(r.rating); });
    return () => { alive = false; };
  }, []);

  /*
    LIVE since 30 Jul 2026 — slides come from the admin panel.

    The API already applies the zone and the live-from/live-to dates, so
    whatever arrives is what this visitor should see; nothing here does date
    arithmetic. `visual` has no column: real photography is still a launch
    dependency, so the gradient and drawn art stay as the backdrop until an
    `imageUrl` exists, and are indexed so each slide keeps its own look.
  */
  useEffect(() => {
    let alive = true;
    getShopBanners(zoneCode(zone)).then((res) => {
      if (!alive || res === null) return;
      const live = res.banners.filter((b) => b.placement === "HERO");
      // An empty result is a real answer — the owner switched every slide off —
      // but a homepage with no hero at all is not something to ship silently.
      // Keep the last known-good set and let the section stay populated.
      if (live.length === 0) return;
      setBanners(live.map((b, i) => toHeroBanner(b, fallback[i % fallback.length])));
      setRotateMs(res.heroRotateSeconds * 1000);
      setIndex(0);
    });
    return () => { alive = false; };
  }, [zone]);

  // Reset to first banner when zone changes
  useEffect(() => setIndex(0), [zone]);

  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % banners.length), rotateMs);
    return () => clearInterval(t);
  }, [banners.length, rotateMs]);

  return (
    <section
      className="overflow-hidden relative"
      style={{ background: "linear-gradient(135deg,#FDF9FF 0%,#F7F1FB 48%,#F9E9FD 100%)" }}
    >
      <div className="max-w-[1200px] mx-auto px-6">
        {/* All slides stacked in one grid cell — smooth crossfade between them */}
        <div className="grid">
          {banners.map((c, slideIndex) => (
        <div
          key={c.id}
          aria-hidden={slideIndex !== index}
          className={`col-start-1 row-start-1 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 lg:gap-11 items-center pt-6 pb-4 lg:pt-14 lg:pb-10 relative transition-all duration-1000 ease-in-out ${
            slideIndex === index
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 pointer-events-none"
          }`}
        >

          {/* ---- Left: copy ---- */}
          <div>
            <div className="inline-flex items-center gap-2.5 bg-white rounded-full px-5 py-2.5 text-[12.5px] tracking-[0.14em] uppercase font-semibold text-purple shadow-soft mb-6 whitespace-nowrap">
              <span className="w-2 h-2 bg-orchid rounded-[50%_50%_50%_0] rotate-[-45deg] block shrink-0" />
              {c.eyebrow}
            </div>

            <h1
              className="font-display font-medium text-purple leading-[1.08] mb-5"
              style={{ fontSize: "clamp(34px, 5vw, 60px)" }}
            >
              {c.h1Line1}
              {c.h1Line2 && <><br />{c.h1Line2} </>}
              <em className="not-italic text-orchid">{c.h1Accent}</em>
            </h1>

            <p className="text-[16px] lg:text-[17.5px] font-light text-body-soft max-w-[46ch] mb-7 leading-relaxed">
              {c.lead}
            </p>

            <div className="flex gap-3.5 flex-wrap items-center">
              <Link
                href={c.cta1.href}
                className="inline-flex items-center gap-2.5 px-8 lg:px-10 py-4 bg-purple text-white rounded-full font-medium text-[15.5px] tracking-[0.03em] shadow-[0_12px_30px_rgba(71,0,102,0.25)] hover:bg-purple-deep hover:-translate-y-0.5 transition-all whitespace-nowrap"
              >
                {c.cta1.label} <ArrowIcon />
              </Link>
              <Link
                href={c.cta2.href}
                className="inline-flex items-center gap-2.5 px-7 lg:px-9 py-[15px] bg-white/92 text-purple rounded-full font-medium text-[15px] hover:bg-white transition-all whitespace-nowrap"
              >
                {c.cta2.label}
              </Link>
            </div>

            <div className="flex gap-6 mt-8 flex-wrap">
              {(c.fromAdmin ? c.proof : c.proof.map(withRealRating(rating)))
                .filter(Boolean)
                .map((item, i) => (
                <div key={item} className="flex items-center gap-2.5 text-sm font-medium text-purple whitespace-nowrap">
                  <span className={`w-2 h-2 rounded-[50%_50%_50%_0] rotate-[-45deg] block shrink-0 ${i === 2 ? "bg-rosegold" : "bg-orchid"}`} />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* ---- Right: visual (photo slot — Cloudinary later) — desktop only ---- */}
          <div className="hidden lg:block relative h-[470px] max-w-[500px] w-full mx-auto lg:mx-0">
            {/* An uploaded photo replaces the drawn artwork; the arch shape and
                the shadow stay either way, so the page keeps its silhouette
                whether or not the photography has happened yet. */}
            <div
              className="absolute inset-0 overflow-hidden shadow-lift bg-cover bg-center"
              style={{
                borderRadius: "240px 240px 28px 28px",
                ...(c.imageUrl
                  ? { backgroundImage: `url(${c.imageUrl})` }
                  : { background: c.visual.gradient }),
              }}
            >
              {!c.imageUrl && (
                <div className="w-full h-full flex items-end justify-center">
                  <BannerArt art={c.visual.art} />
                </div>
              )}
            </div>

            {/* An empty card is not a smaller card — it is a white box floating
                over the photograph for no reason. Both the card and its icon
                disappear when there is nothing in them, so leaving these blank
                is a legitimate way to have a plain hero. */}
            <FloatCard card={c.float1} className="top-10 -left-2 lg:-left-7" />
            <FloatCard card={c.float2} className="bottom-12 -right-1 lg:-right-5" />
          </div>
        </div>
          ))}
        </div>

        {/* ---- Dots ---- */}
        {banners.length > 1 && (
          <div className="flex justify-center gap-[9px] pb-6">
            {banners.map((b, i) => (
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
