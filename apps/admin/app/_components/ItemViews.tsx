"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  WRAP, ACCENT, msg, ItemPageHead, ErrBar, OkBar, DemoBar, Kpi,
} from "./ItemUI";
import {
  loadItemsSafe, loadItemCategoriesSafe,
  createItemCategory, updateItemCategory, deleteItemCategory,
  formatTaka, ITEM_TYPE_META,
  type ApiItem, type ApiItemCategory,
} from "../_data/api";

/* NOTE: the Items overview now lives in ItemsOverview.tsx — it was rewritten to be
   pure KPI (sobuj, 21 Jul: "oprojonio jinis gula dorkar nai"). Only the older
   categories view remains here; /items/categories uses ItemCategoriesView.tsx. */

export function ItemCategoriesView() {
  const [groups, setGroups] = useState<ApiItemCategory[]>([]);
  const [items, setItems] = useState<ApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [parent, setParent] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [g, i] = await Promise.all([loadItemCategoriesSafe(), loadItemsSafe()]);
      setGroups(g.groups); setIsDemo(g.isDemo); setItems(i.items);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const tops = useMemo(
    () => groups.filter((g) => !g.parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [groups],
  );
  const kidsOf = (id: string) => groups.filter((g) => g.parentId === id);
  const countFor = (id: string) => items.filter((i) => i.itemCategoryId === id).length;

  async function add() {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    if (isDemo) { setErr("Start the API (:4000) to save groups."); return; }
    setBusy(true);
    try { await createItemCategory({ name, parentId: parent || null }); await load(); }
    catch (e) { setErr(msg(e, "Could not create that category.")); }
    finally { setBusy(false); }
  }

  async function rename(g: ApiItemCategory, name: string) {
    const v = name.trim();
    if (!v || v === g.name) return;
    setGroups((p) => p.map((x) => (x.id === g.id ? { ...x, name: v } : x)));
    if (isDemo) return;
    try { await updateItemCategory(g.id, { name: v }); }
    catch (e) { setErr(msg(e, "Could not rename.")); await load(); }
  }

  async function toggle(g: ApiItemCategory) {
    setGroups((p) => p.map((x) => (x.id === g.id ? { ...x, isActive: !x.isActive } : x)));
    if (isDemo) return;
    try { await updateItemCategory(g.id, { isActive: !g.isActive }); }
    catch (e) { setErr(msg(e, "Could not save.")); await load(); }
  }

  async function remove(g: ApiItemCategory) {
    const n = countFor(g.id);
    const kids = kidsOf(g.id).length;
    if (n || kids) {
      setErr(`“${g.name}” cannot be deleted — ${[n ? `${n} item(s) are in it` : "", kids ? `it has ${kids} sub-group(s)` : ""].filter(Boolean).join(" and ")}. Move them first.`);
      return;
    }
    if (!confirm(`Delete the “${g.name}” category?`)) return;
    setGroups((p) => p.filter((x) => x.id !== g.id));
    if (isDemo) return;
    try { await deleteItemCategory(g.id); }
    catch (e) { setErr(msg(e, "Could not delete.")); await load(); }
  }


  const ungrouped = items.filter((i) => !i.itemCategoryId).length;

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="master data · items"
        title="Item categories"
        blurb="The Item module\u2019s own tree — Fresh Flowers → Roses. Nothing here ever reaches the website; the storefront has its own separate Categories."
        right={<Link href="/items/list" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid">All items</Link>}
      />

      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && <OkBar text={ok} onClose={() => setOk(null)} />}
      {isDemo && <DemoBar what="a sample tree" onRetry={load} />}
      {loading && <div className="text-[13px] text-body-soft mb-4">Loading…</div>}

      {/* why this is separate from Category */}
      <div className="rounded-[14px] border px-4 py-3 mb-5 text-[12.5px] grid grid-cols-[auto_1fr] gap-3 items-start" style={{ background: "#f7f1fb", borderColor: "#efe4f7" }}>
        <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-white shrink-0 mt-0.5" style={{ background: ACCENT }}><Icon name="grid" size={14} /></span>
        <div>
          <div className="font-semibold text-[13px]" style={{ color: "#470066" }}>Two different trees, on purpose</div>
          <p className="m-0 mt-0.5 text-body leading-relaxed">
            <b>Categories</b> are how a shopper browses the website — they have pictures, page titles and Google
            descriptions. <b>Item categories</b> are how your stockroom is organised. “Rose Stems” belongs here and must
            never turn up in the site menu or on Google.
          </p>
        </div>
      </div>

      {!loading && groups.length === 0 && (
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-6 mb-6 flex items-center gap-4 flex-wrap">
          <span className="w-[42px] h-[42px] rounded-[12px] grid place-items-center text-white shrink-0" style={{ background: ACCENT }}><Icon name="folder" size={20} /></span>
          <div className="flex-1 min-w-[240px]">
            <div className="font-display text-[16px] text-purple">No item categories yet</div>
            <p className="text-body-soft text-[12.5px] m-0">
              Add your first group with the button above — Fresh Flowers, Packaging, Gift Items, whatever your
              stockroom actually holds.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_290px] gap-6 items-start">
        <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden">
          <div className="px-4 py-2.5 border-b border-lavender-deep bg-lavender/30 text-[12.5px] font-semibold text-purple">
            {tops.length} categor{tops.length === 1 ? "y" : "ies"}
          </div>

          <div className="divide-y divide-lavender-deep">
            {tops.map((g) => (
              <div key={g.id}>
                <GroupRow g={g} count={countFor(g.id)} depth={0} onRename={(v) => rename(g, v)} onToggle={() => toggle(g)} onDelete={() => remove(g)} />
                {kidsOf(g.id).map((c) => (
                  <GroupRow key={c.id} g={c} count={countFor(c.id)} depth={1} onRename={(v) => rename(c, v)} onToggle={() => toggle(c)} onDelete={() => remove(c)} />
                ))}
              </div>
            ))}
            {!loading && tops.length === 0 && (
              <div className="text-[13px] text-body-soft text-center py-8">No categories yet — add one below.</div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-lavender-deep bg-lavender/20">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_190px_auto] gap-2">
              <input className="ipt" style={{ minHeight: 40 }} placeholder="New category — e.g. Fresh Flowers"
                value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
              <select className="ipt" style={{ minHeight: 40 }} value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value="">Top level</option>
                {tops.map((t) => <option key={t.id} value={t.id}>inside {t.name}</option>)}
              </select>
              <button onClick={add} disabled={busy || !draft.trim()}
                className="text-white text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] inline-flex items-center gap-2 shrink-0 disabled:opacity-50"
                style={{ background: ACCENT }}>
                <Icon name="plus" size={15} /> Add
              </button>
            </div>
            <p className="text-[13px] text-body-soft m-0 mt-2">Two levels only — a category inside a category inside a category gets unusable fast.</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-5">
          {ungrouped > 0 && (
            <div className="rounded-[16px] border px-4 py-3.5" style={{ background: "#fbf1e2", borderColor: "#f0dcb8" }}>
              <div className="text-[12.5px] font-semibold mb-1" style={{ color: "#8a5209" }}>{ungrouped} item(s) have no category</div>
              <p className="text-[12px] text-body m-0">They will be missing from every grouped report.</p>
              <Link href="/items/list" className="inline-block mt-2 text-[12.5px] underline text-purple">Go and set them</Link>
            </div>
          )}
          <div className="rounded-[16px] border px-4 py-3.5 bg-white shadow-soft border-lavender-deep text-[12px] text-body">
            <div className="text-[12.5px] font-semibold text-purple mb-1.5">Red rose vs white rose</div>
            <p className="m-0 leading-relaxed">
              Those stay <b>two separate items</b> — separate stock, separate cost, bought separately. The category is what
              ties the family together, and the Colour label on each one says which is which.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupRow({
  g, count, depth, onRename, onToggle, onDelete,
}: { g: ApiItemCategory; count: number; depth: number; onRename: (v: string) => void; onToggle: () => void; onDelete: () => void }) {
  const [name, setName] = useState(g.name);
  useEffect(() => { setName(g.name); }, [g.name]);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_90px_46px_34px] items-center gap-2 px-4 py-2.5 hover:bg-lavender/15"
      style={{ paddingLeft: 16 + depth * 24, borderLeft: `4px solid ${g.isActive ? (depth ? "#efe4f7" : ACCENT) : "#e5dced"}` }}>
      <input
        className="w-full bg-transparent border-0 outline-none text-[13.5px] text-purple focus:bg-white focus:border focus:border-lavender-deep rounded-[7px] px-1 -ml-1 py-0.5"
        style={{ fontWeight: depth ? 400 : 600 }}
        value={name} onChange={(e) => setName(e.target.value)}
        onBlur={() => { const v = name.trim(); if (v) onRename(v); else setName(g.name); }}
      />
      <span className="text-[13px] text-body-soft">{count > 0 ? `${count} item${count === 1 ? "" : "s"}` : "—"}</span>
      <button onClick={onToggle} className="w-[38px] h-[21px] rounded-full relative justify-self-center" style={{ background: g.isActive ? ACCENT : "#d6cbdf" }}>
        <span className="absolute top-[3px] w-[15px] h-[15px] bg-white rounded-full transition-all" style={{ left: g.isActive ? 20 : 3 }} />
      </button>
      <button onClick={onDelete} className="text-body-soft hover:text-[#c0392b] justify-self-center"><Icon name="trash" size={14} /></button>
    </div>
  );
}
