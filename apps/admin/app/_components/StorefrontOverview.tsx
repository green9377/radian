"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  listCategoriesSafe, listBanners, listCollections, listSectionText,
  listReviews, listJournalPosts, WEB_BASE,
  type ApiCategoryNode, type ApiBanner, type ApiCollection,
  type ApiSectionText, type ApiReview, type ApiJournalPost,
} from "../_data/api";

/*
  Storefront — the hub, 31 Jul 2026.

  WHY THIS EXISTS. The Storefront group had grown to ten flat entries and was
  gaining one every time a page got connected. The owner's instruction: make
  Storefront the module and the rest sub-modules inside it.

  THE GROUPING IS BY THE JOB IN HAND, NOT BY TABLE:

    Pages        the arrangement of a page, top to bottom
    Blocks       the pieces that get PLACED on those pages
    Words        what the shop says, and what customers say back
    Shop details facts about the business, shown on every page

  "Where do I change the banner on the flowers page" is a Pages question even
  though a banner is a Block. Sorted by where he would look for it.

  ── The second pass, same day ────────────────────────────────────────────────
  First version was four rows of cards in a 4-column grid. On a wide monitor
  the last column of most rows was empty, so a full-width page READ as a
  half-width one, and the owner said so twice. Two columns of panels fill the
  width whatever the group sizes are, which is the actual fix — not another
  max-width.

  Every number on this page is READ, never stored. A hub with its own tallies
  is wrong the moment somebody edits something on another screen. Each read
  falls back to a dash: a route still works without its badge.
*/

type Tone = "brand" | "sky" | "emerald" | "amber";

const TONE: Record<Tone, { grad: string; ring: string; text: string; soft: string }> = {
  brand: { grad: "linear-gradient(135deg,#7B2D8E,#C155D8)", ring: "#43304b", text: "#ca88dd", soft: "#2c1b35" },
  sky: { grad: "linear-gradient(135deg,#1f5fa8,#57a8e0)", ring: "#2c3d4f", text: "#7fb3e6", soft: "#192838" },
  emerald: { grad: "linear-gradient(135deg,#12795a,#3ec294)", ring: "#324940", text: "#7de8c0", soft: "#1f332a" },
  amber: { grad: "linear-gradient(135deg,#a2650f,#e5a733)", ring: "#50432b", text: "#efbb76", soft: "#3c2e17" },
};

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

type Row = {
  href: string;
  label: string;
  blurb: string;
  icon: string;
  /** the one number worth a badge — the rest is noise on a doorway */
  value?: string;
  hint?: string;
  /** 0–100, or null when there is nothing meaningful to be a fraction of */
  progress?: number | null;
  /** something that wants attention today */
  alert?: boolean;
};

export default function StorefrontOverview() {
  const [cats, setCats] = useState<ApiCategoryNode[] | null>(null);
  const [banners, setBanners] = useState<ApiBanner[] | null>(null);
  const [collections, setCollections] = useState<ApiCollection[] | null>(null);
  const [text, setText] = useState<ApiSectionText[] | null>(null);
  const [reviews, setReviews] = useState<ApiReview[] | null>(null);
  const [posts, setPosts] = useState<ApiJournalPost[] | null>(null);

  useEffect(() => {
    void (async () => {
      const [c, b, col, t, r, p] = await Promise.all([
        listCategoriesSafe().then((x) => x.items).catch(() => null),
        listBanners().catch(() => null),
        listCollections().catch(() => null),
        listSectionText().catch(() => null),
        listReviews().catch(() => null),
        listJournalPosts().catch(() => null),
      ]);
      setCats(c); setBanners(b); setCollections(col); setText(t); setReviews(r); setPosts(p);
    })();
  }, []);

  const tops = cats?.filter((c) => !c.parentId) ?? [];
  const withBanner = tops.filter((c) => c.bannerHeading || c.bannerUrl).length;
  const liveBanners = banners?.filter((b) => b.isActive).length ?? null;
  const defaults = text?.filter((s) => s.zone === "") ?? [];
  const written = defaults.filter((s) => s.title || s.eyebrow).length;
  const pending = reviews?.filter((r) => r.status === "PENDING").length ?? null;
  const published = reviews?.filter((r) => r.status === "PUBLISHED").length ?? null;
  const livePosts = posts?.filter((p) => p.isPublished).length ?? null;

  const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));
  const pctOf = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 100));

  const groups: { title: string; blurb: string; tone: Tone; rows: Row[] }[] = [
    {
      title: "Pages",
      blurb: "How a page is arranged, top to bottom.",
      tone: "brand",
      rows: [
        {
          href: "/storefront/layout", label: "Homepage", icon: "grid",
          blurb: "Order, wording, banners, trust strip and budget cards — all inside it.",
          value: n(liveBanners), hint: "banners live",
        },
        {
          href: "/storefront/category-page", label: "Category pages", icon: "layers",
          blurb: "One screen per category page — banner, sections, questions.",
          value: n(tops.length || null), hint: "category pages",
          progress: pctOf(withBanner, tops.length),
        },
      ],
    },
    {
      /*
        31 Jul — Banners, Collections and the Trust strip left this list. They
        are edited inside the homepage now, where they appear. What remains
        here is what is NOT part of one page.
      */
      title: "Every page",
      blurb: "Not part of one page — these show up all over the site.",
      tone: "emerald",
      rows: [
        {
          href: "/storefront/reviews", label: "Reviews", icon: "star",
          blurb: "Google, customer-submitted and hand-entered. Moderation is on.",
          value: n(pending), hint: "waiting for you",
          alert: (pending ?? 0) > 0,
          progress: reviews ? pctOf(published ?? 0, reviews.length) : null,
        },
        {
          href: "/storefront/journal", label: "Journal", icon: "book",
          blurb: "Articles, and the cards that link to them.",
          value: n(livePosts), hint: "published",
          progress: posts ? pctOf(livePosts ?? 0, posts.length) : null,
        },
      ],
    },
    {
      title: "Shop details",
      blurb: "Facts about the business, on every page.",
      tone: "amber",
      rows: [
        {
          href: "/storefront/hours", label: "Visit the shop", icon: "pin",
          blurb: "Address, opening hours, closures and the map.",
        },
        {
          href: "/storefront/footer", label: "Footer & menus", icon: "hash",
          blurb: "Link groups, social profiles and payment badges.",
        },
      ],
    },
  ];

  /* The four figures worth putting at the top: one per group, each answering
     "is anything waiting for me here". Nothing decorative — a number that never
     changes teaches the eye to skip the strip. */
  const kpis: { label: string; value: string; sub: string; tone: Tone; icon: string }[] = [
    { label: "Category pages", value: n(tops.length || null), sub: `${withBanner} with a banner written`, tone: "brand", icon: "layers" },
    { label: "Banners live", value: n(liveBanners), sub: banners ? `of ${banners.length} made` : "—", tone: "sky", icon: "photo" },
    { label: "Reviews waiting", value: n(pending), sub: (pending ?? 0) > 0 ? "needs your approval" : "nothing to approve", tone: "emerald", icon: "star" },
    { label: "Headings written", value: n(defaults.length ? written : null), sub: defaults.length ? `of ${defaults.length} on the site` : "—", tone: "amber", icon: "edit" },
  ];

  return (
    <div className={WRAP}>
      {/* ── the band ─────────────────────────────────────────────────────── */}
      <div
        className="rounded-[20px] px-6 py-6 md:px-8 md:py-7 mb-4 text-white relative overflow-hidden"
        style={{ background: "linear-gradient(120deg,#4a1259 0%,#7B2D8E 45%,#B44BC9 100%)" }}
      >
        {/* the petal, brand-side — the same shape the storefront uses for its
            bullet, at a size where it reads as texture rather than an icon */}
        <span
          aria-hidden
          className="absolute -right-10 -top-14 w-[230px] h-[230px] rounded-[50%_50%_50%_0] -rotate-45 opacity-[0.13]"
          style={{ background: "linear-gradient(150deg,#1f1727,#351840)" }}
        />
        <div className="relative flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#e9c9f5] mb-1.5">Storefront</div>
            <h1 className="font-display text-[26px] md:text-[30px] font-medium m-0 leading-tight">The shop, as a customer sees it</h1>
            <p className="text-[13px] text-[#e6d3ee] mt-2 mb-0 max-w-[76ch]">
              Everything on the public site is set here. Marketing owns what goes
              out to people; this owns what they find when they arrive.
            </p>
          </div>
          <a
            href={WEB_BASE}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 bg-white/95 hover:bg-white text-purple text-[13px] font-semibold px-5 py-2.5 rounded-[11px] inline-flex items-center gap-2 transition-colors"
          >
            <Icon name="eye" size={15} /> Open the shop
          </a>
        </div>
      </div>

      {/* ── the four figures ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-[16px] border bg-white px-4 py-3.5 flex items-center gap-3.5" style={{ borderColor: TONE[k.tone].ring }}>
            <span className="w-[42px] h-[42px] rounded-[13px] grid place-items-center text-white shrink-0" style={{ background: TONE[k.tone].grad }}>
              <Icon name={k.icon} size={19} />
            </span>
            <div className="min-w-0">
              <div className="font-display text-[24px] leading-none" style={{ color: TONE[k.tone].text }}>{k.value}</div>
              <div className="text-[12.5px] text-purple font-medium mt-1 truncate">{k.label}</div>
              <div className="text-[11px] text-body-soft truncate">{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── the sub-modules, two columns so no row ends half-empty ───────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {groups.map((g) => (
          <div key={g.title} className="rounded-[18px] border bg-white overflow-hidden" style={{ borderColor: TONE[g.tone].ring }}>
            <div className="px-5 py-3.5 flex items-center gap-3" style={{ background: TONE[g.tone].soft }}>
              <span className="w-[30px] h-[30px] rounded-[10px] grid place-items-center text-white shrink-0" style={{ background: TONE[g.tone].grad }}>
                <Icon name={g.rows[0].icon} size={15} />
              </span>
              <div className="min-w-0">
                <div className="font-display text-[16px]" style={{ color: TONE[g.tone].text }}>{g.title}</div>
                <div className="text-[11.5px] text-body-soft truncate">{g.blurb}</div>
              </div>
              <span className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: TONE[g.tone].text, background: "#1f1727" }}>
                {g.rows.length} screens
              </span>
            </div>

            <div className="divide-y divide-lavender-deep/60">
              {g.rows.map((r) => (
                <Link key={r.href} href={r.href} className="group flex items-center gap-3.5 px-5 py-3.5 hover:bg-lavender/30 transition-colors">
                  <span
                    className="w-[34px] h-[34px] rounded-[11px] grid place-items-center shrink-0 transition-colors"
                    style={{ background: TONE[g.tone].soft, color: TONE[g.tone].text }}
                  >
                    <Icon name={r.icon} size={16} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium text-purple group-hover:text-orchid flex items-center gap-2">
                      {r.label}
                      {r.alert && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#3c2a17] text-[#efbb76]">
                          needs you
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-body-soft truncate">{r.blurb}</div>

                    {/* a bar only where the fraction MEANS something — how much
                        of this is actually set up. No bar is better than a bar
                        measuring nothing. */}
                    {r.progress !== null && r.progress !== undefined && (
                      <div className="mt-2 h-[5px] rounded-full bg-lavender-deep/50 overflow-hidden max-w-[260px]">
                        <span
                          className="block h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(4, r.progress)}%`, background: TONE[g.tone].grad }}
                        />
                      </div>
                    )}
                  </div>

                  {r.value !== undefined && (
                    <div className="text-right shrink-0">
                      <div className="font-display text-[19px] leading-none" style={{ color: TONE[g.tone].text }}>{r.value}</div>
                      <div className="text-[10.5px] text-body-soft mt-1">{r.hint}</div>
                    </div>
                  )}
                  <span className="text-body-soft/60 group-hover:text-orchid shrink-0">›</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[14px] border border-lavender-deep bg-lavender/40 px-5 py-4 text-[12.5px] text-body-soft">
        <b className="text-purple">Where things are NOT.</b> A category&apos;s name,
        its place in the menu and its card art are in <b>Categories</b> — that is
        what the category <i>is</i>. What its page <i>says</i> is here. Product
        photos and prices are in <b>Products</b>; this only decides which of them
        a page shows.
      </div>
    </div>
  );
}
