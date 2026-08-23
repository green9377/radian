"use client";

import { useEffect, useRef, useState } from "react";

import Icon from "./Icon";
import {
  createCraftPoint,
  deleteCraftPoint,
  getCraftPoints,
  updateCraftPoint,
  type ApiCraftPoint,
} from "../_data/api";

/*
  ═══════════════════════════════════════════════════════════════════════════
  Craft points — the three "why buy this from us" cards under the fold.

  ONE COMPONENT, TWO PLACES, exactly like `BundleEditor`: a category's default
  list and one product's override are the same screen with a different id.

  The owner's decision (31 Jul): write it once on the category. Seventy-one
  products cannot each have three paragraphs typed by hand — so in practice
  they would be written once and every product added afterwards would show an
  empty section.
  ═══════════════════════════════════════════════════════════════════════════
*/

type Owner = { categoryId: string; productId?: never } | { productId: string; categoryId?: never };

/*
  The owner picks, he cannot type — a name the storefront does not know would
  render as a neutral tick and he would never learn why.

  ⚠️ EVERY NAME HERE EXISTS IN BOTH ICON SETS. The admin and the storefront
  keep separate copies (`shared/` is empty and neither app maps to it — the
  trust-strip work of 30 Jul settled that twenty path strings are not worth a
  workspace package). So a name in one and not the other draws correctly on the
  website and blank on this screen. `sun` and `store` would suit craft cards
  better than anything below; they are in the storefront's set only. Adding
  those two to `Icon.tsx` here is the right fix and a separate change.
*/
const ICONS = [
  { name: "sparkle", hint: "freshness" },
  { name: "shield", hint: "guarantee" },
  { name: "bolt", hint: "speed" },
  { name: "heart", hint: "care" },
  { name: "star", hint: "quality" },
  { name: "truck", hint: "delivery" },
  { name: "clock", hint: "timing" },
  { name: "tag", hint: "value" },
];

export default function CraftEditor({
  owner,
  inheritedFrom,
  inheritedFromId,
}: {
  owner: Owner;
  inheritedFrom?: string;
  /*  23 Aug 2026 — owner: *"why buy from us ata product upload page a jay
      nai."* Half of that was the tab it hid behind; the other half was this
      component saying "this product shows Fresh flower's cards" and then not
      showing a single one. With the id it can fetch them and put them on the
      screen, with one press to take them over.  */
  inheritedFromId?: string;
}) {
  const [rows, setRows] = useState<ApiCraftPoint[]>([]);
  const [inherited, setInherited] = useState<ApiCraftPoint[]>([]);
  const [copying, setCopying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const key = owner.productId ?? owner.categoryId;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCraftPoints(owner)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /*  What the category already puts on this product's page. Fetched only when
      an id was handed down, so the category's own editor never asks.  */
  useEffect(() => {
    if (!inheritedFromId) {
      setInherited([]);
      return;
    }
    let alive = true;
    getCraftPoints({ categoryId: inheritedFromId })
      .then((r) => alive && setInherited(r.filter((x) => x.title.trim())))
      .catch(() => alive && setInherited([]));
    return () => {
      alive = false;
    };
  }, [inheritedFromId]);

  /*  Take the category's cards over. They are COPIED — the same rule "What's
      inside" and the FAQ follow — so editing them here never reaches the
      category, and the category's stop showing on this product because what
      a product writes REPLACES what its category wrote.  */
  async function copyFromCategory() {
    setCopying(true);
    setErr(null);
    try {
      const made: ApiCraftPoint[] = [];
      for (const [i, c] of inherited.entries()) {
        made.push(
          await createCraftPoint({
            ...owner,
            icon: c.icon,
            title: c.title,
            text: c.text,
            sortOrder: rows.length + i,
          }),
        );
      }
      setRows((r) => [...r, ...made]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCopying(false);
    }
  }

  function patch(id: string, body: Record<string, unknown>, optimistic: Partial<ApiCraftPoint>) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...optimistic } : x)));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      updateCraftPoint(id, body).catch((e: Error) => setErr(e.message));
    }, 450);
  }

  async function add() {
    setErr(null);
    try {
      const created = await createCraftPoint({
        ...owner,
        icon: ICONS[rows.length % ICONS.length].name,
        title: "",
        text: "",
        sortOrder: rows.length,
      });
      setRows((r) => [...r, created]);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
    await deleteCraftPoint(id).catch((e: Error) => setErr(e.message));
  }

  if (loading) return <div className="text-[13px] text-body-soft">Loading…</div>;

  return (
    <div>
      {/*  ── what the category already puts on the page ──────────────────
          The same panel badges, "What's inside" and the FAQ use. Before
          23 Aug this said the cards were inherited and showed none of them,
          so there was no way to tell a working card from a lost one.  */}
      {inheritedFrom && rows.length === 0 && inherited.length > 0 && (
        <div className="border border-lavender-deep bg-lavender/40 rounded-[12px] p-3 mb-3.5">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-orchid">
              On the page now · from {inheritedFrom}
            </span>
            <button
              type="button"
              onClick={copyFromCategory}
              disabled={copying}
              className="border border-orchid bg-white text-orchid text-[12.5px] font-bold px-3 py-1.5 rounded-[9px] hover:bg-orchid hover:text-white transition-colors disabled:opacity-50"
            >
              {copying ? "Copying…" : "Use these and edit"}
            </button>
          </div>
          <div className="grid gap-2 opacity-75">
            {inherited.map((c) => (
              <div key={c.id} className="flex items-start gap-2 text-[13px]">
                <span className="text-purple shrink-0 mt-[2px]">
                  <Icon name={c.icon} size={15} />
                </span>
                <span className="min-w-0">
                  <b className="font-bold text-purple block">{c.title}</b>
                  <span className="text-body-soft line-clamp-2">{c.text}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*  Nothing anywhere — say so plainly rather than showing an empty
          panel that looks broken.  */}
      {inheritedFrom && rows.length === 0 && inherited.length === 0 && (
        <div className="flex items-start gap-2.5 bg-lavender/60 rounded-[11px] px-3 py-2.5 mb-3.5 text-[13px] text-body">
          <span className="text-purple shrink-0 mt-[1px]">
            <Icon name="layers" size={16} />
          </span>
          <span>
            <b className="font-semibold text-purple">{inheritedFrom}</b> has no cards written
            yet, so this product shows none. Write them once on the category and every
            product here gets them — or write this one&rsquo;s own below.
          </span>
        </div>
      )}

      {inheritedFrom && rows.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3.5 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5 bg-[#fff4e5] text-[#8a5a00] font-bold rounded-full px-2.5 py-1">
            This product&rsquo;s own
          </span>
          <span className="text-body-soft">&mdash; it replaces {inheritedFrom}&rsquo;s.</span>
        </div>
      )}

      <div className="flex flex-col gap-2.5 mb-3.5">
        {rows.map((c, i) => (
          <div key={c.id} className="bg-lavender/50 rounded-[12px] p-3">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-body-soft">
                Card {i + 1}
              </span>
              <div className="flex gap-1 ml-1">
                {ICONS.map((ic) => (
                  <button
                    key={ic.name}
                    type="button"
                    title={ic.hint}
                    onClick={() => patch(c.id, { icon: ic.name }, { icon: ic.name })}
                    className={`w-[30px] h-[30px] rounded-[8px] grid place-items-center border transition-colors ${
                      c.icon === ic.name
                        ? "bg-purple border-purple text-white"
                        : "bg-white border-lavender-deep text-body-soft hover:border-orchid"
                    }`}
                  >
                    <Icon name={ic.name} size={15} />
                  </button>
                ))}
              </div>
              <button
                type="button"
                title="Remove this card"
                onClick={() => remove(c.id)}
                className="ml-auto w-[30px] h-[30px] rounded-[8px] grid place-items-center border border-lavender-deep bg-white text-body-soft hover:text-[#c0392b] hover:border-[#c0392b] transition-colors shrink-0"
              >
                <Icon name="trash" size={15} />
              </button>
            </div>

            <input
              className="ipt h-[38px] mb-2"
              placeholder="Cut this morning, in her hands tonight"
              value={c.title}
              onChange={(e) => patch(c.id, { title: e.target.value }, { title: e.target.value })}
            />
            <textarea
              className="ipt min-h-[62px] py-2"
              placeholder="Every bouquet starts before sunrise at the market — only stems that pass the 5-day freshness test make it in."
              value={c.text}
              onChange={(e) => patch(c.id, { text: e.target.value }, { text: e.target.value })}
            />

            {/*  An empty card is worse than a missing one: it renders as a
                bordered box with an icon and no words.  */}
            {(!c.title.trim() || !c.text.trim()) && (
              <div className="mt-2 text-[12.5px] text-[#b45309] flex items-center gap-1.5">
                <Icon name="alert" size={14} />
                Not showing on the site until both lines are filled in.
              </div>
            )}
          </div>
        ))}
      </div>

      {err && <div className="text-[13px] text-[#c0392b] mb-2.5">{err}</div>}

      {/*  Three, because the storefront lays them out in a row of three. A
          fourth wraps onto its own line and looks like a mistake.  */}
      {rows.length < 3 ? (
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-purple border border-lavender-deep bg-white rounded-[10px] px-3 py-2 hover:border-orchid transition-colors"
        >
          <Icon name="plus" size={15} /> Add a card
        </button>
      ) : (
        <p className="text-[13px] text-body-soft m-0">
          Three is the full row. Remove one to write a different card.
        </p>
      )}
    </div>
  );
}
