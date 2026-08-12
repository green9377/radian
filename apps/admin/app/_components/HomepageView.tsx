"use client";

import { useState } from "react";
import Icon from "./Icon";
import PageLayoutView from "./PageLayoutView";
import BannersView from "./BannersView";
import TrustStripView from "./TrustStripView";
import CollectionsView from "./CollectionsView";
import SectionTextView from "./SectionTextView";
import HomeContentView from "./HomeContentView";

/*
  The homepage — everything it needs, behind the SAME COLOURFUL SIDE RAIL as
  Reviews, Journal, Pages and Footer (owner, 12 Aug: "pase amn tab kre design
  kre pura page ta sajaw").

  HOW THIS ARRIVED HERE, because the earlier wrong turns are worth keeping:

  1. Split by data type — banners here, wording there. Tidy, and useless:
     nobody thinks "I need the banners screen", they think "I want to change
     the picture at the top of the homepage".
  2. Everything folded into the layout rows — an accordion holding a form
     holding another accordion. The owner's word was "biroktikor".
  3. Pill tabs along the top — worked, but every other Storefront screen now
     wears the rail, and one module should not have two navigations.

  Each rail entry opens the REAL editor, not a cut-down copy — `embedded`
  hides that editor's own page title and padding.

  ⚠️ NOT here: Reviews, Journal, Visit the shop, Footer. They render at the
  bottom of EVERY page, so they keep their own screens.
*/

const SECTIONS = [
  {
    id: "layout", label: "Layout", blurb: "Which sections, in what order", icon: "grid",
    tint: "#f3e8f9", edge: "#e6d3f2", chip: "#e6d3f2",
    ink: "#3b0b52", sub: "#816894", strong: "#470066",
    fill: "linear-gradient(100deg,#470066,#7a1e86)", glow: "rgba(71,0,102,.30)", soft: "#e9a8f5",
  },
  {
    id: "contents", label: "Contents", blurb: "What goes inside each section", icon: "box",
    tint: "#e9f2fb", edge: "#c8ddf1", chip: "#c8ddf1",
    ink: "#123f68", sub: "#5b82a8", strong: "#185FA5",
    fill: "linear-gradient(100deg,#185FA5,#3f83c4)", glow: "rgba(24,95,165,.25)", soft: "#a9cdec",
  },
  {
    id: "banners", label: "Banners", blurb: "The big picture and the promo strip", icon: "photo",
    tint: "#fbeaf0", edge: "#f2cddb", chip: "#f2cddb",
    ink: "#6b2138", sub: "#a06a7c", strong: "#993556",
    fill: "linear-gradient(100deg,#993556,#c25476)", glow: "rgba(153,53,86,.28)", soft: "#f4c0d1",
  },
  {
    id: "trust", label: "Trust strip", blurb: "The promises under the banner", icon: "shield",
    tint: "#e9f7ee", edge: "#c9e8d4", chip: "#c9e8d4",
    ink: "#124f2e", sub: "#5c8f74", strong: "#0E7A3D",
    fill: "linear-gradient(100deg,#0E7A3D,#2f9c5c)", glow: "rgba(14,122,61,.25)", soft: "#a9e3c1",
  },
  {
    id: "budget", label: "Budget cards", blurb: "Gifts for Every Budget", icon: "cash",
    tint: "#fdf4e5", edge: "#f0deb9", chip: "#f0deb9",
    ink: "#6b4a08", sub: "#a5854a", strong: "#8a5a00",
    fill: "linear-gradient(100deg,#8a5a00,#b8821e)", glow: "rgba(138,90,0,.25)", soft: "#f0d9a4",
  },
  {
    id: "wording", label: "Wording", blurb: "The three lines above every section", icon: "tag",
    tint: "#f3eff8", edge: "#e4dcee", chip: "#e4dcee",
    ink: "#453556", sub: "#8b7c9c", strong: "#5f4b73",
    fill: "linear-gradient(100deg,#5f4b73,#7f6b93)", glow: "rgba(95,75,115,.24)", soft: "#ded4ec",
  },
] as const;
type SecId = (typeof SECTIONS)[number]["id"];

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

export default function HomepageView() {
  const [sec, setSec] = useState<SecId>("layout");
  const active = SECTIONS.find((s) => s.id === sec)!;

  return (
    <div className={WRAP}>
      {/* the brand band — the same one the Storefront hub wears */}
      <div
        className="rounded-[18px] px-6 py-5 mb-4 text-white relative overflow-hidden"
        style={{ background: "linear-gradient(120deg,#4a1259 0%,#7B2D8E 48%,#B44BC9 100%)" }}
      >
        <span
          aria-hidden
          className="absolute -right-8 -top-12 w-[190px] h-[190px] rounded-[50%_50%_50%_0] -rotate-45 opacity-[0.13]"
          style={{ background: "linear-gradient(150deg,#ffffff,#f0c9ff)" }}
        />
        <div className="relative">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#e9c9f5] mb-1">Storefront</div>
          <h1 className="font-display text-[24px] font-medium m-0 leading-tight">Homepage</h1>
          <p className="text-[12.5px] text-[#e6d3ee] mt-1.5 mb-0">{active.blurb}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[236px_minmax(0,1fr)] gap-5 items-start">
        {/* ---- the colourful section rail ---- */}
        <nav className="hidden md:grid gap-2 md:sticky md:top-[84px] self-start">
          {SECTIONS.map((s) => {
            const on = sec === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSec(s.id)}
                className="w-full min-w-0 overflow-hidden flex items-center gap-3 px-3.5 py-3 rounded-[14px] text-left transition-all"
                style={on
                  ? { background: s.fill, border: "1px solid transparent", boxShadow: `0 5px 16px ${s.glow}` }
                  : { background: s.tint, border: `1px solid ${s.edge}` }}
              >
                <span className="w-[34px] h-[34px] rounded-[11px] grid place-items-center shrink-0"
                  style={{ background: on ? "rgba(255,255,255,.22)" : s.chip, color: on ? "#fff" : s.strong }}>
                  <Icon name={s.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium truncate"
                    style={{ color: on ? "#fff" : s.ink }}>{s.label}</span>
                  <span className="block text-[11px] truncate"
                    style={{ color: on ? s.soft : s.sub }}>{s.blurb}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* ---- the open section — the real editor, not a copy ---- */}
        <div className="min-w-0">
          <div className="md:hidden mb-4">
            <select className="ipt h-[44px]" value={sec} onChange={(e) => setSec(e.target.value as SecId)}>
              {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          {sec === "layout" && (
            <PageLayoutView
              embedded
              /*  The pencil on a row lands on the rail entry that section is
                  edited from — without this it would be a dead end on nine of
                  eleven rows.  */
              onEditSection={(key) =>
                setSec(
                  key === "hero" || key === "promo" ? "banners"
                    : key === "trust" ? "trust"
                    : key === "budget" ? "budget"
                    : key === "categories" || key === "occasions" || key === "delivery" ? "contents"
                    : "wording",
                )
              }
            />
          )}
          {sec === "contents" && (
            <Panel title="Contents" hint="Tick what belongs on the homepage, and use the arrows to order it">
              <HomeContentView />
            </Panel>
          )}
          {sec === "banners" && (
            <Panel title="Banners" hint="The big picture at the top, the promo strip, and the announcement line">
              <BannersView embedded />
            </Panel>
          )}
          {sec === "trust" && (
            <Panel title="Trust strip" hint="The promises under the banner — per zone">
              <TrustStripView embedded />
            </Panel>
          )}
          {sec === "budget" && (
            <Panel title="Budget cards" hint="The shelves under Gifts for Every Budget">
              <CollectionsView embedded />
            </Panel>
          )}
          {sec === "wording" && (
            <Panel title="Wording" hint="The three lines above every section of the homepage">
              <SectionTextView embedded only="home" />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

/*  The frame every section wears, so the six read as six views of ONE
    screen — before this, Layout was a designed card and the rest were bare
    lists dropped onto the page.  */
function Panel({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-lavender-deep overflow-hidden bg-[#f6f0fa] shadow-[0_2px_14px_rgba(80,40,100,0.06)]">
      <div
        className="px-5 py-3.5"
        style={{ background: "linear-gradient(120deg,#f7f0fb 0%,#f4e9fa 55%,#fbf2f4 100%)" }}
      >
        <div className="font-display text-[16px] text-purple">{title}</div>
        <div className="text-[12px] text-body-soft">{hint}</div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
