"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, ACCENT, DemoBar, ItemThumb } from "./ItemUI";
import {
  loadItemsSafe, loadItemCategoriesSafe, formatTaka, ITEM_TYPE_META,
  type ApiItem, type ApiItemCategory,
} from "../_data/api";

/*
  Master Data · Items — OVERVIEW.

  Rewritten to be pure numbers (sobuj, 21 Jul: "oprojonio jinis gula dorkar nai, just
  amder dorkari KPI diye overview page ta akorsonio kro"). Gone: the two teaching
  cards, the "So a Product never has to be special" strip, the Set-up link list, the
  "Where is stock?" note. Those explained the model to someone seeing it for the first
  time; the owner now knows it, and they were eating the whole screen.

  What is left is what a shop owner opens this page to find out:
    · how big the master is, and what it is worth per unit
    · what is broken (no cost / no photo / no category / recipe missing)
    · how the items split by type
    · the most expensive things
*/

export default function ItemsOverview() {
  const [items, setItems] = useState<ApiItem[]>([]);
  const [cats, setCats] = useState<ApiItemCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([loadItemsSafe(), loadItemCategoriesSafe()]);
      setItems(a.items); setIsDemo(a.isDemo); setCats(b.groups);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const s = useMemo(() => {
    const noCost = items.filter((i) => i.effectiveCostPaisa <= 0 && !i.isSaleable);
    /*  the one gap that stops a sale dead: on the counter with no price (20 Aug)  */
    const noPrice = items.filter((i) => i.isSaleable && i.effectiveSellPricePaisa == null);
    const noPhoto = items.filter((i) => !i.imageUrl);
    const noCat = items.filter((i) => !i.itemCategoryId);
    const emptyRecipe = items.filter(
      (i) => i.itemType === "FINISHED" && i.assemblyMode !== "NONE" && (i._count?.components ?? 0) === 0,
    );
    const assembled = items.filter((i) => i.assemblyMode !== "NONE");
    const perUnit = items.reduce((n, i) => n + i.effectiveCostPaisa, 0);
    const dearest = items.slice().sort((a, b) => b.effectiveCostPaisa - a.effectiveCostPaisa).slice(0, 5);
    const byType = (Object.keys(ITEM_TYPE_META) as (keyof typeof ITEM_TYPE_META)[])
      .map((t) => ({ t, n: items.filter((i) => i.itemType === t).length }))
      .filter((x) => x.n > 0);
    const hidden = items.filter((i) => !i.isActive).length;
    return { noCost, noPrice, noPhoto, noCat, emptyRecipe, assembled, perUnit, dearest, byType, hidden };
  }, [items]);

  /* Only the problems that actually exist, worst first — and every one of them now
     lands on All items with the matching filter already applied, because the Recipes
     and Costs boards were removed (21 Jul): they only repeated what the list already
     shows, and "assembled but no recipe" is an Assembly question, not an Item one. */
  const issues = [
    { n: s.noPrice.length, label: "on sale with no price", tone: "#c0392b", bg: "#fdecea", icon: "cash", href: "/items/list?only=noPrice" },
    { n: s.noCost.length, label: "no cost set", tone: "#b45309", bg: "#fff4e6", icon: "box", href: "/items/list?only=noCost" },
    { n: s.noCat.length, label: "not in a category", tone: "#0e8f74", bg: "#e7f5f1", icon: "grid", href: "/items/list" },
    { n: s.noPhoto.length, label: "no photo", tone: "#b76e79", bg: "#f6ece3", icon: "photo", href: "/items/list?only=noPhoto" },
  ].filter((x) => x.n > 0);

  return (
    <div className={WRAP}>
      {/* header */}
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="text-[11px] font-bold tracking-[0.1em] uppercase" style={{ color: ACCENT }}>master data · items</div>
          <h1 className="font-display text-[30px] text-purple mt-1 mb-0 leading-tight">Items</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/items/list" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-semibold px-4 py-2.5 rounded-[11px] hover:border-orchid">All items</Link>
          <Link href="/items/new" className="text-white text-[13.5px] font-semibold px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2" style={{ background: ACCENT }}>
            <Icon name="plus" size={15} /> New item
          </Link>
        </div>
      </div>

      {isDemo && <DemoBar what="sample data" onRetry={load} />}
      {loading && <div className="text-[13px] text-body-soft mb-4">Loading…</div>}

      {/* ---- the five numbers ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 mb-5">
        <BigKpi label="Total items" value={items.length} sub={s.hidden ? `${s.hidden} hidden` : "all visible"}
          tone="#470066" bg="linear-gradient(140deg,#f5eafb,#efe0f8)" icon="box" href="/items/list" />
        <BigKpi label="Ingredients & packing" value={items.filter((i) => i.itemType === "RAW" || i.itemType === "PACKAGING").length}
          sub="what goes into things" tone="#0e8f74" bg="linear-gradient(140deg,#e7f5f1,#d9efe8)" icon="layers" href="/items/list" />
        <BigKpi label="Assembled" value={s.assembled.length} sub="built from a recipe"
          tone="#a020c9" bg="linear-gradient(140deg,#f9e9fd,#f3d9fa)" icon="sparkle" href="/items/list" />
        <BigKpi label="Categories" value={cats.length} sub="stockroom tree"
          tone="#b5642f" bg="linear-gradient(140deg,#f9efe6,#f4e3d3)" icon="grid" href="/items/categories" />
        <BigKpi label="Cost of one of each" value={formatTaka(s.perUnit)} sub="not stock value"
          tone="#0e7a3d" bg="linear-gradient(140deg,#e8f7ef,#d8f0e3)" icon="cash" href="/items/list?sort=cost" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        {/* ---- needs attention ---- */}
        <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-lavender-deep flex items-center gap-2">
            <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-white" style={{ background: ACCENT }}>
              <Icon name="bolt" size={13} />
            </span>
            <span className="text-[14px] font-semibold text-purple">Needs attention</span>
            {issues.length > 0 && (
              <span className="ml-auto text-[12px] font-bold px-2.5 py-1 rounded-full text-white" style={{ background: "#c0392b" }}>
                {issues.reduce((n, i) => n + i.n, 0)}
              </span>
            )}
          </div>

          {issues.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <span className="w-[46px] h-[46px] rounded-[13px] grid place-items-center text-white mx-auto mb-3" style={{ background: "#12a172" }}>
                <Icon name="check" size={22} />
              </span>
              <div className="text-[15px] text-purple font-semibold">
                {items.length === 0 ? "No items yet" : "Everything is in order"}
              </div>
              <p className="text-[13px] text-body-soft m-0 mt-1">
                {items.length === 0
                  ? "Start with the things you buy — rose stems, ribbon, boxes."
                  : "Every item has a cost, a photo, a category and a recipe where it needs one."}
              </p>
              {items.length === 0 && (
                <Link href="/items/new" className="inline-flex items-center gap-2 mt-4 text-white text-[13.5px] font-semibold px-5 py-2.5 rounded-[11px]" style={{ background: ACCENT }}>
                  <Icon name="plus" size={15} /> Add your first item
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-lavender-deep">
              {issues.map((t, i) => (
                <Link key={i} href={t.href}
                  className="px-5 py-3.5 grid grid-cols-[42px_minmax(0,1fr)_auto] gap-3 items-center hover:bg-lavender/25 transition-colors">
                  <span className="w-[38px] h-[38px] rounded-[11px] grid place-items-center text-white" style={{ background: t.tone }}>
                    <Icon name={t.icon} size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="text-[19px] font-bold leading-none" style={{ color: t.tone }}>{t.n}</span>
                    <span className="text-[14px] text-body ml-2">{t.label}</span>
                  </span>
                  <span className="text-[13px] font-semibold px-3 py-1.5 rounded-[9px]" style={{ background: t.bg, color: t.tone }}>
                    Fix →
                  </span>
                </Link>
              ))}
            </div>
          )}

          {/* split by type — a quick shape-of-the-master read */}
          {s.byType.length > 0 && (
            <div className="px-5 py-4 border-t border-lavender-deep">
              <div className="th mb-2.5">By type</div>
              <div className="flex h-[10px] rounded-full overflow-hidden mb-3">
                {s.byType.map(({ t, n }) => (
                  <span key={t} style={{ width: `${(n / items.length) * 100}%`, background: ITEM_TYPE_META[t].colour }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {s.byType.map(({ t, n }) => (
                  <Link key={t} href="/items/list" className="inline-flex items-center gap-2 text-[13px]">
                    <span className="w-[10px] h-[10px] rounded-full" style={{ background: ITEM_TYPE_META[t].colour }} />
                    <span className="text-body">{ITEM_TYPE_META[t].label}</span>
                    <b className="text-purple">{n}</b>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---- most expensive ---- */}
        <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-lavender-deep flex items-center gap-2">
            <span className="text-[14px] font-semibold text-purple">Most expensive</span>
            <Link href="/items/list?sort=cost" className="ml-auto text-[12.5px] font-semibold underline text-purple">all costs</Link>
          </div>
          <div className="divide-y divide-lavender-deep">
            {s.dearest.map((i) => (
              <Link key={i.id} href={`/items/${i.id}`} className="px-4 py-2.5 flex items-center gap-3 hover:bg-lavender/25">
                <ItemThumb item={i} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] text-purple font-medium truncate">{i.name}</span>
                  <span className="block text-[12px] text-body-soft">{ITEM_TYPE_META[i.itemType].short}</span>
                </span>
                <span className="text-[13.5px] font-semibold text-body shrink-0">{formatTaka(i.effectiveCostPaisa)}</span>
              </Link>
            ))}
            {!loading && s.dearest.length === 0 && (
              <div className="px-5 py-8 text-center text-[13px] text-body-soft">Nothing yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- one KPI tile */

function BigKpi({
  label, value, sub, tone, bg, icon, href,
}: { label: string; value: string | number; sub: string; tone: string; bg: string; icon: string; href: string }) {
  return (
    <Link href={href}
      className="rounded-[16px] px-4 py-4 shadow-soft border border-white/70 block hover:shadow-lift transition-shadow"
      style={{ background: bg }}>
      <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-white" style={{ background: tone }}>
        <Icon name={icon} size={15} />
      </span>
      <div className="font-display text-[30px] leading-none mt-3" style={{ color: tone }}>{value}</div>
      <div className="text-[13px] font-semibold text-body mt-2 leading-tight">{label}</div>
      <div className="text-[11.5px] text-body-soft mt-0.5">{sub}</div>
    </Link>
  );
}
