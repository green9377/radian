"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  WRAP, ACCENT, msg, ItemPageHead, ErrBar, OkBar, DemoBar, Kpi, ItemThumb, TypeChip,
} from "./ItemUI";
import {
  loadItemTrashSafe, restoreItem, purgeItem,
  formatTaka,
  type ApiItem,
} from "../_data/api";

/*
  Item module boards — the three "look across everything" screens.
  Architecture: RADIAN_ITEM_MODULE_ARCHITECTURE.md §7a.

    TRASH   soft-deleted items, restorable. Without it "delete" reads as permanent loss
            and staff stop deleting anything, which is how a master ends up with 500
            dead rows (the audited ERP had exactly that).
    RECIPES every assembled item + its cost roll-up, so an empty or LOSING recipe is
            visible without opening items one at a time.
    COSTS   where the money sits and where it is missing.
*/

/* ============================================================ TRASH */

export function ItemTrashView() {
  const [items, setItems] = useState<ApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    try { const r = await loadItemTrashSafe(); setItems(r.items); setIsDemo(r.isDemo); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)) : items;
  }, [items, query]);

  /* ITM-R14 — the item queued for permanent destruction. Kept here rather than per
     row so only ONE can be open at a time: two open confirm boxes is exactly how the
     wrong thing gets destroyed. */
  const [purging, setPurging] = useState<ApiItem | null>(null);
  const [busy, setBusy] = useState(false);

  async function restore(i: ApiItem) {
    setItems((p) => p.filter((x) => x.id !== i.id));
    try { await restoreItem(i.id); setOk(`“${i.name}” is back in your items.`); }
    catch (e) { setErr(msg(e, "Could not restore.")); await load(); }
  }

  async function purge() {
    if (!purging) return;
    setBusy(true); setErr(null);
    try {
      await purgeItem(purging.id, purging.sku);
      setItems((p) => p.filter((x) => x.id !== purging.id));
      setOk(`“${purging.name}” is gone for good.`);
      setPurging(null);
    } catch (e) { setErr(msg(e, "Could not destroy it.")); }
    finally { setBusy(false); }
  }

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="master data · items"
        title="Trash"
        right={<Link href="/items/list" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid">All items</Link>}
      />

      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && <OkBar text={ok} onClose={() => setOk(null)} />}
      {isDemo && <DemoBar what="an empty trash" onRetry={load} />}
      {loading && <div className="text-[13px] text-body-soft mb-4">Loading…</div>}

      <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-lavender-deep flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-soft pointer-events-none"><Icon name="search" size={15} /></span>
            <input className="ipt ipt-icon w-full" placeholder="Search deleted items…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <span className="text-[13px] text-body-soft shrink-0">{filtered.length} in trash</span>
        </div>

        <div className="divide-y divide-lavender-deep">
          {filtered.map((i) => {
            const open = purging?.id === i.id;
            return (
              <div key={i.id} style={{ borderLeft: `4px solid ${open ? "#c0392b" : "#3e3744"}` }}>
                <div className="grid grid-cols-[44px_88px_minmax(0,1fr)_110px_100px_auto] items-center gap-2 px-4 py-2.5">
                  <ItemThumb item={i} />
                  <TypeChip type={i.itemType} />
                  <div className="min-w-0">
                    <div className="text-[13.5px] text-body truncate">{i.name}</div>
                    <div className="text-[13px] text-body-soft font-mono">{i.sku}</div>
                  </div>
                  <span className="text-[13px] text-body-soft truncate">{i.itemCategory?.name ?? "—"}</span>
                  <span className="text-[13px] text-body-soft">{formatTaka(i.effectiveCostPaisa ?? 0)}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => restore(i)}
                      className="text-white text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] inline-flex items-center gap-1.5"
                      style={{ background: ACCENT }}>
                      <Icon name="upload" size={13} /> Restore
                    </button>
                    {/* the destructive action is deliberately the QUIETER of the two:
                        restoring should always look like the easier thing to do */}
                    <button
                      onClick={() => { setPurging(open ? null : i); setErr(null); }}
                      title="Remove from the database for good"
                      className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] border inline-flex items-center gap-1.5"
                      style={open
                        ? { background: "#c0392b", borderColor: "#e1837a", color: "#fff" }
                        : { background: "#fff", borderColor: "#f0d4d0", color: "#e1837a" }}>
                      <Icon name="trash" size={13} /> {open ? "Cancel" : "Destroy"}
                    </button>
                  </span>
                </div>

                {/* ITM-R14 — the confirm step. Inline rather than a modal: the row you
                    are about to destroy stays visible right above the question. */}
                {open && (
                  <div className="px-4 pb-4 pt-1" style={{ background: "#371b18" }}>
                    <div className="rounded-[12px] border p-4" style={{ borderColor: "#f0c8c2", background: "#fff" }}>
                      <div className="flex items-start gap-3">
                        <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-white shrink-0"
                          style={{ background: "#c0392b" }}>
                          <Icon name="bolt" size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-bold" style={{ color: "#e1837a" }}>
                            This cannot be undone
                          </div>
                          <p className="text-[13px] text-body m-0 mt-1">
                            “{i.name}” will be removed from the database completely — its photo, cost, labels and
                            history all go with it. Restoring will no longer be possible.
                          </p>

                          {/*  The typed-code box is gone (owner, 22 Aug 2026). It
                               guarded nothing a plain Yes does not: the real fences
                               are server-side — already in the trash, and nothing
                               pointing at it.  */}
                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <button onClick={purge} disabled={busy} autoFocus
                              className="text-white text-[13px] font-semibold px-4 py-2.5 rounded-[10px] disabled:opacity-40"
                              style={{ background: "#c0392b" }}>
                              {busy ? "Destroying…" : "Yes, destroy it"}
                            </button>
                            <button onClick={() => setPurging(null)} disabled={busy}
                              className="text-[13px] font-semibold px-4 py-2.5 rounded-[10px] border border-lavender-deep text-body hover:bg-lavender">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-14 px-4">
              <span className="w-[46px] h-[46px] rounded-[13px] grid place-items-center text-white mx-auto mb-3" style={{ background: "#12a172" }}>
                <Icon name="check" size={22} />
              </span>
              <div className="text-[14px] text-purple font-medium">{query ? "Nothing matches" : "Trash is empty"}</div>
              <p className="text-[13px] text-body-soft m-0 mt-1">
                {query ? "Try a different search." : "Nothing has been deleted — that is a good sign."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================ RECIPE BOARD */

/* ItemRecipeBoard and ItemCostBoard used to live here and were deleted on 21 Jul.

   Recipes: DEC-ITM-011 phase 3 moved recipe editing to the Assembly module. Leaving a
   Recipes screen under Items would have given one idea two homes — the exact confusion
   the move was made to remove.

   Costs: every figure on it already appears somewhere else — "no cost" is an alert on
   the Overview, "most expensive first" is a sort on All items, and the search was the
   same search. A screen that only repeats other screens still costs a sidebar row and
   a decision every time someone looks at the menu.

   Overview's tiles now link to /items/list with the filter in the query string. */
