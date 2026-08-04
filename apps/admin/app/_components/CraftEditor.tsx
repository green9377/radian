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
}: {
  owner: Owner;
  inheritedFrom?: string;
}) {
  const [rows, setRows] = useState<ApiCraftPoint[]>([]);
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
      {inheritedFrom && rows.length === 0 && (
        <div className="flex items-start gap-2.5 bg-lavender/60 rounded-[11px] px-3 py-2.5 mb-3.5 text-[13px] text-body">
          <span className="text-purple shrink-0 mt-[1px]">
            <Icon name="layers" size={16} />
          </span>
          <span>
            This product shows <b className="font-semibold text-purple">{inheritedFrom}</b>&rsquo;s
            cards. Write your own here only if this one has a different story —
            what you add <b className="font-semibold text-purple">replaces</b> the
            category&rsquo;s.
          </span>
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
