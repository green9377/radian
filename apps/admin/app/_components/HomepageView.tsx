"use client";

import { useState } from "react";
import PageLayoutView from "./PageLayoutView";
import BannersView from "./BannersView";
import TrustStripView from "./TrustStripView";
import CollectionsView from "./CollectionsView";
import SectionTextView from "./SectionTextView";
import HomeContentView from "./HomeContentView";

/*
  The homepage — everything it needs, behind five tabs.

  HOW THIS ARRIVED HERE, because the two wrong turns are worth remembering:

  1. Split by data type. Layout on one screen, wording on another, banners on a
     third. Tidy, and useless: nobody thinks "I need the banners screen", they
     think "I want to change the picture at the top of the homepage".

  2. Everything folded into the layout rows. Press Edit on a row and the whole
     banner editor unfolded inside the list — with its own save bar, inside the
     page's save bar. The owner's word for it was "biroktikor", and he was
     right: an accordion holding a form holding another accordion is not a
     simplification, it is the same complexity with worse navigation.

  Tabs. One page, one screen, five plain doors along the top, and each door
  opens the real editor — not a cut-down copy of it. `embedded` on each of
  those components hides its page title and padding so the tab reads as one
  screen rather than a page inside a page.

  ⚠️ What is NOT here: Reviews, Journal, Visit the shop, Footer. They render at
  the bottom of EVERY page, so filing them under the homepage would file them
  under one of the many pages they appear on. They keep their own screens.
*/

type Tab = "layout" | "contents" | "banners" | "trust" | "budget" | "wording";

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "layout", label: "Layout", hint: "Which sections show, and in what order" },
  /* Second on purpose. Layout answers "does this section appear"; Contents
     answers "and what is in it". They are the same question one level apart,
     so they belong side by side — the owner went looking for the second one on
     the Layout tab and it was not there. (3 Aug 2026) */
  { key: "contents", label: "Contents", hint: "What goes inside each section — which categories, occasions and delivery cards" },
  { key: "banners", label: "Banners", hint: "The big picture at the top, and the promo strip" },
  { key: "trust", label: "Trust strip", hint: "The row of promises under the banner" },
  { key: "budget", label: "Budget cards", hint: "Gifts for Every Budget" },
  { key: "wording", label: "Wording", hint: "The three lines above every section" },
];

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

export default function HomepageView() {
  const [tab, setTab] = useState<Tab>("layout");
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className={WRAP}>
      {/* the brand band — the same one the Storefront hub wears, so the two
          screens read as one module rather than two projects */}
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
          {/* the one line that changes with the tab — in the band, where the
              eye already is. Two paragraphs of instructions under it was the
              thing the owner said looked wrong, and repeating them in every
              panel was why they piled up. */}
          <p className="text-[12.5px] text-[#e6d3ee] mt-1.5 mb-0">{active.hint}</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "px-4 py-2 rounded-full text-[13.5px] font-medium border transition-all " +
              (tab === t.key
                ? "text-white border-transparent shadow-[0_3px_12px_rgba(80,40,100,0.22)]"
                : "bg-white text-body border-lavender-deep hover:border-orchid")
            }
            style={tab === t.key ? { background: "linear-gradient(135deg,#7B2D8E,#C155D8)" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>


      {tab === "layout" && (
        <PageLayoutView
          embedded
          /*
            The pencil on a row lands on the tab that section is edited from.
            Hero and promo are banners, the trust strip and the budget cards
            have their own; the three sections whose CONTENTS are chosen go to
            Contents; everything else is words, so it goes to Wording.
            Without this the pencil would be a dead end on nine of eleven rows.
          */
          onEditSection={(key) =>
            setTab(
              key === "hero" || key === "promo" ? "banners"
                : key === "trust" ? "trust"
                : key === "budget" ? "budget"
                : key === "categories" || key === "occasions" || key === "delivery" ? "contents"
                : "wording",
            )
          }
        />
      )}
      {tab === "contents" && (
        <Panel title="Contents" hint="Tick what belongs on the homepage, and use the arrows to order it">
          <HomeContentView />
        </Panel>
      )}
      {tab === "banners" && (
        <Panel title="Banners" hint="The big picture at the top, the promo strip, and the announcement line">
          <BannersView embedded />
        </Panel>
      )}
      {tab === "trust" && (
        <Panel title="Trust strip" hint="The promises under the banner — per zone">
          <TrustStripView embedded />
        </Panel>
      )}
      {tab === "budget" && (
        <Panel title="Budget cards" hint="The shelves under Gifts for Every Budget">
          <CollectionsView embedded />
        </Panel>
      )}
      {tab === "wording" && (
        <Panel title="Wording" hint="The three lines above every section of the homepage">
          <SectionTextView embedded only="home" />
        </Panel>
      )}
    </div>
  );
}

/*
  The frame every tab wears — the same one the Layout tab draws for itself:
  a soft gradient header, a tinted body, and whatever the tab puts inside
  sitting on top of it as white cards.

  It exists so the five tabs read as five views of ONE screen. Before this,
  Layout was a designed card and the other four were bare lists dropped onto
  the page, which made pressing a tab feel like leaving the page.
*/
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
